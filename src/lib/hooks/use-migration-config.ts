import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  calculateMigrationTotals,
  DEFAULT_PROJECT_LINES,
  DEFAULT_WORKFLOW_LINES,
  DEFAULT_COST_LINES,
  type MigrationConfig,
  type MigrationTotals,
} from "@/lib/calculations/migration-engine";
import { NUM } from "@/lib/calculations/num";
import { toEngineLine } from "@/lib/calculations/adapters";
import { fetchRequiredRates } from "@/lib/supabase/queries";
import { createMigrationPersistenceController } from "./migration-persistence";

export type DbConfig = {
  id: string;
  proposal_id: string;
  num_projects: number;
  hrs_per_import: number;
  lines_per_import_file: number;
  is_effort_included: boolean;
  is_workshop_included: boolean;
  pm_contingency_pct: number;
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

export type DbLine = {
  id: string;
  proposal_id: string;
  section: string;
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
  row_order: number;
};

export type UseMigrationConfigReturn = {
  config: DbConfig | null;
  lines: DbLine[];
  baRate: number | null;
  pmRate: number | null;
  travelRate: number | null;
  rateError: string | null;
  loading: boolean;
  totals: MigrationTotals | null;
  numProjects: number;
  projectLines: DbLine[];
  workflowLines: DbLine[];
  costLines: DbLine[];
  updateConfig: (field: keyof DbConfig, value: number | boolean | string) => void;
  updateLine: (lineId: string, field: keyof DbLine, value: string | number) => void;
  addLine: (section: "project" | "workflow" | "cost") => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  retry: () => void;
};

function computeTotalsFromState(
  cfg: DbConfig | null,
  allLines: DbLine[],
  baRate: number | null,
  pmRate: number | null,
  travelRate: number | null
): MigrationTotals | null {
  if (!cfg || baRate == null || pmRate == null || travelRate == null) {
    return null;
  }

  const numProjects = NUM(cfg.num_projects);
  const migrationConfig: MigrationConfig = {
    num_projects: numProjects,
    hrs_per_import: NUM(cfg.hrs_per_import),
    lines_per_import_file: NUM(cfg.lines_per_import_file),
    is_effort_included: cfg.is_effort_included,
    is_workshop_included: cfg.is_workshop_included,
    pm_contingency_pct: NUM(cfg.pm_contingency_pct),
    ba_complexity_factor: NUM(cfg.ba_complexity_factor),
    pm_complexity_factor: NUM(cfg.pm_complexity_factor),
    ba_trips: NUM(cfg.ba_trips),
    pm_trips: NUM(cfg.pm_trips),
    doc_avg_mb_per_project: NUM(cfg.doc_avg_mb_per_project),
    doc_mb_per_hour: NUM(cfg.doc_mb_per_hour),
    core_requirements_hrs: NUM(cfg.core_requirements_hrs),
    core_migration_plan_hrs: NUM(cfg.core_migration_plan_hrs),
    core_validation_hrs: NUM(cfg.core_validation_hrs),
    core_final_qa_hrs: NUM(cfg.core_final_qa_hrs),
    core_pm_oversight_hrs: NUM(cfg.core_pm_oversight_hrs),
  };
  const projectLines = allLines
    .filter((line) => line.section === "project")
    .map((line) => toEngineLine(line, { quantityOverride: numProjects }));
  const workflowLines = allLines
    .filter((line) => line.section === "workflow")
    .map((line) => toEngineLine(line));
  const costLines = allLines
    .filter((line) => line.section === "cost")
    .map((line) => toEngineLine(line));

  return calculateMigrationTotals(
    migrationConfig,
    projectLines,
    workflowLines,
    costLines,
    baRate,
    pmRate,
    travelRate
  );
}

export function useMigrationConfig(proposalId: string): UseMigrationConfigReturn {
  const supabase = createClient();

  const [config, setConfig] = useState<DbConfig | null>(null);
  const [lines, setLines] = useState<DbLine[]>([]);
  const [baRate, setBaRate] = useState<number | null>(null);
  const [pmRate, setPmRate] = useState<number | null>(null);
  const [travelRate, setTravelRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  // Refs for closure-safe access to latest values in callbacks/cleanup
  const configRef = useRef(config);
  const linesRef = useRef(lines);
  const baRateRef = useRef(baRate);
  const pmRateRef = useRef(pmRate);
  const travelRateRef = useRef(travelRate);
  const persistenceControllerRef =
    useRef<ReturnType<typeof createMigrationPersistenceController<DbConfig, DbLine>> | null>(
      null
    );

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    baRateRef.current = baRate;
  }, [baRate]);

  useEffect(() => {
    pmRateRef.current = pmRate;
  }, [pmRate]);

  useEffect(() => {
    travelRateRef.current = travelRate;
  }, [travelRate]);

  useEffect(() => {
    persistenceControllerRef.current = createMigrationPersistenceController({
      getSnapshot: () => ({
        config: configRef.current,
        lines: linesRef.current,
      }),
      saveConfig: async (updated, currentLines) => {
        const totals = computeTotalsFromState(
          updated,
          currentLines,
          baRateRef.current,
          pmRateRef.current,
          travelRateRef.current
        );
        const totalCost = totals?.salesPrice ?? 0;

        await supabase
          .from("migration_config")
          .update({
            num_projects: updated.num_projects,
            hrs_per_import: updated.hrs_per_import,
            lines_per_import_file: updated.lines_per_import_file,
            is_effort_included: updated.is_effort_included,
            is_workshop_included: updated.is_workshop_included,
            pm_contingency_pct: updated.pm_contingency_pct,
            ba_complexity_factor: updated.ba_complexity_factor,
            pm_complexity_factor: updated.pm_complexity_factor,
            ba_trips: updated.ba_trips,
            pm_trips: updated.pm_trips,
            doc_avg_mb_per_project: updated.doc_avg_mb_per_project,
            doc_mb_per_hour: updated.doc_mb_per_hour,
            core_requirements_hrs: updated.core_requirements_hrs,
            core_migration_plan_hrs: updated.core_migration_plan_hrs,
            core_validation_hrs: updated.core_validation_hrs,
            core_final_qa_hrs: updated.core_final_qa_hrs,
            core_pm_oversight_hrs: updated.core_pm_oversight_hrs,
            computed_total_cost: totalCost,
            updated_at: new Date().toISOString(),
          })
          .eq("id", updated.id);
      },
      saveLine: async (line) => {
        await supabase
          .from("migration_detail_lines")
          .update({
            label: line.label,
            quantity: line.quantity,
            items_per_object: line.items_per_object,
            total_line_items: line.total_line_items,
          })
          .eq("id", line.id);
      },
      saveComputedTotal: async (updated, currentLines) => {
        const totals = computeTotalsFromState(
          updated,
          currentLines,
          baRateRef.current,
          pmRateRef.current,
          travelRateRef.current
        );

        await supabase
          .from("migration_config")
          .update({
            computed_total_cost: totals?.salesPrice ?? updated.computed_total_cost,
            updated_at: new Date().toISOString(),
          })
          .eq("id", updated.id);
      },
    });

    return () => {
      const controller = persistenceControllerRef.current;
      persistenceControllerRef.current = null;
      if (controller) {
        void controller.flushNow();
        controller.dispose();
      }
    };
  }, [supabase]);

  // ─── Load ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setRateError(null);

      const ratesResult = await fetchRequiredRates(supabase, [
        "Master|Business Analyst",
        "Master|Program Manager",
        "Master|Travel Cost/Trip",
      ]);
      if (!ratesResult.ok) {
        setRateError(ratesResult.error);
        setLoading(false);
        return;
      }
      const ba = ratesResult.rates.get("Master|Business Analyst")!;
      const pm = ratesResult.rates.get("Master|Program Manager")!;
      const travel = ratesResult.rates.get("Master|Travel Cost/Trip")!;
      setBaRate(ba);
      setPmRate(pm);
      setTravelRate(travel);

      let { data: cfg } = await supabase
        .from("migration_config")
        .select("*")
        .eq("proposal_id", proposalId)
        .single();

      if (!cfg) {
        const { data: newCfg } = await supabase
          .from("migration_config")
          .insert({ proposal_id: proposalId, doc_avg_mb_per_project: 0 })
          .select()
          .single();
        cfg = newCfg;
      }

      if (cfg) setConfig(cfg as DbConfig);

      let { data: existingLines } = await supabase
        .from("migration_detail_lines")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("section")
        .order("row_order");

      if (!existingLines || existingLines.length === 0) {
        const allDefaults = [
          ...DEFAULT_PROJECT_LINES,
          ...DEFAULT_WORKFLOW_LINES,
          ...DEFAULT_COST_LINES,
        ].map((l) => ({ ...l, proposal_id: proposalId }));

        const { data: newLines } = await supabase
          .from("migration_detail_lines")
          .insert(allDefaults)
          .select();

        existingLines = newLines;
      }

      if (existingLines) setLines(existingLines as DbLine[]);
      setLoading(false);
    };
    load();
  }, [proposalId, supabase, reloadToken]);

  // ─── Update helpers ──────────────────────────────────────────────
  const updateConfig = useCallback(
    (field: keyof DbConfig, value: number | boolean | string) => {
      if (!config) return;
      const updated = { ...config, [field]: value };

      if (field === "is_effort_included" && value === true) {
        updated.is_workshop_included = false;
      }
      if (field === "is_workshop_included" && value === true) {
        updated.is_effort_included = false;
      }

      setConfig(updated);
      configRef.current = updated;
      persistenceControllerRef.current?.scheduleConfigSave();
    },
    [config]
  );

  const updateLine = useCallback(
    (lineId: string, field: keyof DbLine, value: string | number) => {
      setLines((prev) => {
        const next = prev.map((l) =>
          l.id === lineId ? { ...l, [field]: value } : l
        );
        linesRef.current = next;
        persistenceControllerRef.current?.scheduleLineSave(lineId);
        return next;
      });
    },
    []
  );

  const addLine = useCallback(
    async (section: "project" | "workflow" | "cost") => {
      const sectionLines = lines.filter((l) => l.section === section);
      const nextOrder = sectionLines.length;
      const label =
        section === "workflow"
          ? "WF Object Name"
          : section === "cost"
            ? "TBD"
            : "New Item";

      const { data } = await supabase
        .from("migration_detail_lines")
        .insert({
          proposal_id: proposalId,
          section,
          label,
          quantity: 0,
          items_per_object: 0,
          total_line_items: 0,
          row_order: nextOrder,
        })
        .select()
        .single();

      if (data) {
        setLines((prev) => {
          const next = [...prev, data as DbLine];
          linesRef.current = next;
          return next;
        });
        persistenceControllerRef.current?.scheduleTotalsRecompute();
      }
    },
    [lines, proposalId, supabase]
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      await supabase.from("migration_detail_lines").delete().eq("id", lineId);
      setLines((prev) => {
        const next = prev.filter((l) => l.id !== lineId);
        linesRef.current = next;
        return next;
      });
      persistenceControllerRef.current?.scheduleTotalsRecompute();
    },
    [supabase]
  );

  // ─── Derived values ──────────────────────────────────────────────
  const totals = computeTotalsFromState(
    config,
    lines,
    baRate,
    pmRate,
    travelRate
  );
  const numProjects = NUM(config?.num_projects);
  const projectLines = lines.filter((l) => l.section === "project");
  const workflowLines = lines.filter((l) => l.section === "workflow");
  const costLines = lines.filter((l) => l.section === "cost");

  return {
    config,
    lines,
    baRate,
    pmRate,
    travelRate,
    rateError,
    loading,
    totals,
    numProjects,
    projectLines,
    workflowLines,
    costLines,
    updateConfig,
    updateLine,
    addLine,
    removeLine,
    retry: () => setReloadToken((n) => n + 1),
  };
}
