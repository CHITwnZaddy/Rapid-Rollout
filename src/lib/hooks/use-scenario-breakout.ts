import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  calculateMigrationTotals,
  type MigrationConfig as EngineMigrationConfig,
} from "@/lib/calculations/migration-engine";
import { exportScenarioBreakoutXLSX } from "@/lib/exports/scenario-breakout";
import { applyComplexity } from "@/lib/calculations/complexity";
import { NUM } from "@/lib/calculations/num";
import { toEngineLine } from "@/lib/calculations/adapters";
import { fetchRequiredRates } from "@/lib/supabase/queries";

export type Proposal = {
  id: string;
  name: string;
};

export type ScenarioLine = {
  module: string;
  scope_selection: string | null;
  total_cost: number;
};

export type ScenarioGroup = {
  scenarioType: string;
  lines: ScenarioLine[];
  totalCost: number;
};

export type ScopedLine = {
  service_type: string;
  description: string | null;
  cost: number;
};

export type MigrationConfig = {
  num_projects: number;
  hrs_per_import: number;
  lines_per_import_file: number;
  is_effort_included: boolean;
  is_workshop_included: boolean;
  ba_complexity_factor: number;
  pm_complexity_factor: number;
  ba_trips: number;
  pm_trips: number;
  doc_avg_mb_per_project: number;
  doc_mb_per_hour: number;
  core_requirements_hrs: number;
  core_migration_plan_hrs: number;
  core_validation_hrs: number;
  core_final_qa_hrs: number;
  core_pm_oversight_hrs: number;
  computed_total_cost: number;
};

export type MigrationLine = {
  section: string;
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
};


export function useScenarioBreakout() {
  const supabase = createClient();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState("");
  const [scenarioGroups, setScenarioGroups] = useState<ScenarioGroup[]>([]);
  const [scopedLines, setScopedLines] = useState<ScopedLine[]>([]);
  const [migrationConfig, setMigrationConfig] = useState<MigrationConfig | null>(null);
  const [migrationLines, setMigrationLines] = useState<MigrationLine[]>([]);
  // Rates are fail-closed: start as null, require successful fetch
  // before the report can be run. See Phase 1.3 in the remediation
  // plan for rationale.
  const [baRate, setBaRate] = useState<number | null>(null);
  const [pmRate, setPmRate] = useState<number | null>(null);
  const [travelRate, setTravelRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [rateReloadToken, setRateReloadToken] = useState(0);

  useEffect(() => {
    supabase
      .from("proposals")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (data) setProposals(data);
      });
  }, [supabase]);

  // Rate-card loader: fail closed on error or missing rows. The
  // report refuses to run until this resolves successfully.
  useEffect(() => {
    let cancelled = false;
    fetchRequiredRates(supabase, [
      "Master|Business Analyst",
      "Master|Program Manager",
      "Master|Travel Cost/Trip",
    ]).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setRateError(result.error);
        return;
      }
      setRateError(null);
      setBaRate(result.rates.get("Master|Business Analyst")!);
      setPmRate(result.rates.get("Master|Program Manager")!);
      setTravelRate(result.rates.get("Master|Travel Cost/Trip")!);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, rateReloadToken]);

  const ratesReady =
    baRate != null && pmRate != null && travelRate != null && !rateError;

  const runReport = useCallback(async () => {
    if (!selectedProposal) return;
    setLoading(true);
    setHasRun(true);

    // Phase 2.5 — two fixes here:
    //   1. migration_config used to .select("*"), over-fetching
    //      several internal columns we never read. Pruned to the
    //      exact 16 columns the MigrationConfig interface uses.
    //   2. The scenario_lines subquery used to run a nested
    //      `await supabase.from("scenarios").select("id")` inside
    //      Promise.all — duplicating the scenarios fetch that was
    //      already in the same batch. Fetch scenarios first, then
    //      fan out the four dependent queries in parallel.
    const scenarioRes = await supabase
      .from("scenarios")
      .select("id, scenario_type, summary_total_cost, complexity_factor")
      .eq("proposal_id", selectedProposal)
      .order("scenario_type");

    const scenarioIds = (scenarioRes.data ?? []).map((s) => s.id);

    const [linesRes, scopedRes, migCfgRes, migLinesRes, proposalRes] = await Promise.all([
      supabase
        .from("scenario_lines")
        .select("scenario_id, module, scope_selection, total_cost")
        .in("scenario_id", scenarioIds)
        .order("row_order"),
      supabase
        .from("scoped_services")
        .select("service_type, description, cost")
        .eq("proposal_id", selectedProposal)
        .order("row_order"),
      supabase
        .from("migration_config")
        .select(
          "num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, ba_complexity_factor, pm_complexity_factor, ba_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs, computed_total_cost"
        )
        .eq("proposal_id", selectedProposal)
        .single(),
      supabase
        .from("migration_detail_lines")
        .select("section, label, quantity, items_per_object, total_line_items")
        .eq("proposal_id", selectedProposal)
        .order("section")
        .order("row_order"),
      supabase
        .from("proposals")
        .select("scoped_complexity_factor")
        .eq("id", selectedProposal)
        .single(),
    ]);

    const scopedFactor = Number(proposalRes.data?.scoped_complexity_factor) || 1;

    // Build scenario groups
    const scenarios = scenarioRes.data ?? [];
    const allLines = linesRes.data ?? [];
    const scenarioIdMap = new Map(scenarios.map((s) => [s.id, s.scenario_type]));
    const scenarioFactorMap = new Map(
      scenarios.map((s) => [s.id, Number(s.complexity_factor ?? 1) || 1])
    );

    const order = ["P1", "P2", "Opt1", "Opt2"];
    const groups: ScenarioGroup[] = order
      .map((type) => {
        const scenario = scenarios.find((s) => s.scenario_type === type);
        if (!scenario) return null;
        const sFactor = scenarioFactorMap.get(scenario.id) ?? 1;
        const lines = allLines
          .filter((l) => scenarioIdMap.get(l.scenario_id) === type)
          .filter((l) => NUM(l.total_cost) > 0)
          .map((l) => ({
            module: l.module,
            scope_selection: l.scope_selection,
            total_cost: applyComplexity(NUM(l.total_cost), sFactor),
          }));
        return {
          scenarioType: type,
          lines,
          totalCost: applyComplexity(NUM(scenario.summary_total_cost), sFactor),
        };
      })
      .filter(Boolean) as ScenarioGroup[];

    setScenarioGroups(groups);

    // Scoped services
    const scoped = (scopedRes.data ?? [])
      .filter((s) => NUM(s.cost) > 0)
      .map((s) => ({
        service_type: s.service_type,
        description: s.description,
        cost: applyComplexity(NUM(s.cost), scopedFactor),
      }));
    setScopedLines(scoped);

    // Migration
    if (migCfgRes.data) {
      setMigrationConfig(migCfgRes.data as MigrationConfig);
    } else {
      setMigrationConfig(null);
    }
    setMigrationLines((migLinesRes.data ?? []) as MigrationLine[]);

    setLoading(false);
  }, [supabase, selectedProposal]);

  // Migration detail helpers (needed for migrationLiveTotal computation)
  const projectLines = migrationLines.filter((l) => l.section === "project");
  const workflowLines = migrationLines
    .filter((l) => l.section === "workflow")
    .filter((l) => l.label && l.label !== "WF Object Name" && l.label.trim() !== "");
  const costDataLines = migrationLines
    .filter((l) => l.section === "cost")
    .filter((l) => l.label && l.label !== "TBD" && l.label.trim() !== "");

  // Compute the migration grand total live from the same data the
  // per-section rows display, instead of trusting the stored
  // `computed_total_cost` snapshot (which can drift from the live
  // section breakdowns shown above).
  const migrationLiveTotal =
    migrationConfig && baRate != null && pmRate != null && travelRate != null
      ? (() => {
          const numP = NUM(migrationConfig.num_projects);
          const engineCfg: EngineMigrationConfig = {
            num_projects: numP,
            hrs_per_import: NUM(migrationConfig.hrs_per_import),
            lines_per_import_file: NUM(migrationConfig.lines_per_import_file),
            is_effort_included: migrationConfig.is_effort_included,
            is_workshop_included: migrationConfig.is_workshop_included,
            pm_contingency_pct: 0,
            ba_complexity_factor: NUM(migrationConfig.ba_complexity_factor),
            pm_complexity_factor: NUM(migrationConfig.pm_complexity_factor),
            ba_trips: NUM(migrationConfig.ba_trips),
            pm_trips: NUM(migrationConfig.pm_trips),
            doc_avg_mb_per_project: NUM(migrationConfig.doc_avg_mb_per_project),
            doc_mb_per_hour: NUM(migrationConfig.doc_mb_per_hour),
            core_requirements_hrs: NUM(migrationConfig.core_requirements_hrs),
            core_migration_plan_hrs: NUM(migrationConfig.core_migration_plan_hrs),
            core_validation_hrs: NUM(migrationConfig.core_validation_hrs),
            core_final_qa_hrs: NUM(migrationConfig.core_final_qa_hrs),
            core_pm_oversight_hrs: NUM(migrationConfig.core_pm_oversight_hrs),
          };
          const engineProject = projectLines.map((l) =>
            toEngineLine(l, { quantityOverride: numP })
          );
          const engineWorkflow = workflowLines.map((l) => toEngineLine(l));
          const engineCost = costDataLines.map((l) => toEngineLine(l));
          return calculateMigrationTotals(
            engineCfg,
            engineProject,
            engineWorkflow,
            engineCost,
            baRate,
            pmRate,
            travelRate
          ).salesPrice;
        })()
      : 0;

  const exportXLSX = useCallback(async () => {
    const proposalName =
      proposals.find((p) => p.id === selectedProposal)?.name ?? "report";
    await exportScenarioBreakoutXLSX({
      proposalName,
      scenarioGroups,
      scopedLines,
      migrationSummary: migrationConfig
        ? { total: migrationLiveTotal }
        : null,
    });
  }, [
    scenarioGroups,
    scopedLines,
    migrationConfig,
    migrationLiveTotal,
    proposals,
    selectedProposal,
  ]);

  // Core effort hours
  const coreEffortHours = migrationConfig?.is_effort_included
    ? NUM(migrationConfig.core_requirements_hrs) +
      NUM(migrationConfig.core_migration_plan_hrs) +
      NUM(migrationConfig.core_validation_hrs) +
      NUM(migrationConfig.core_final_qa_hrs)
    : 0;

  return {
    proposals,
    selectedProposal,
    setSelectedProposal,
    scenarioGroups,
    scopedLines,
    migrationConfig,
    migrationLines,
    baRate,
    pmRate,
    rateError,
    loading,
    hasRun,
    ratesReady,
    migrationLiveTotal,
    coreEffortHours,
    runReport,
    exportXLSX,
    retryRates: () => setRateReloadToken((n) => n + 1),
  };
}
