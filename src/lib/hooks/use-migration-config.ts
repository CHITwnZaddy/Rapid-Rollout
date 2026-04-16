import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  calculateMigrationTotals,
  DEFAULT_PROJECT_LINES,
  DEFAULT_WORKFLOW_LINES,
  DEFAULT_COST_LINES,
  type MigrationConfig,
  type MigrationDetailLine,
  type MigrationTotals,
} from "@/lib/calculations/migration-engine";

export interface DbConfig {
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
}

export interface DbLine {
  id: string;
  proposal_id: string;
  section: string;
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
  row_order: number;
}

const NUM = (v: unknown) => Number(v) || 0;

function toEngineLine(l: DbLine): MigrationDetailLine {
  return {
    id: l.id,
    section: l.section as "project" | "workflow" | "cost",
    label: l.label,
    quantity: NUM(l.quantity),
    items_per_object: NUM(l.items_per_object),
    total_line_items: NUM(l.total_line_items),
    row_order: l.row_order,
  };
}

export interface UseMigrationConfigReturn {
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  configRef.current = config;
  linesRef.current = lines;
  baRateRef.current = baRate;
  pmRateRef.current = pmRate;
  travelRateRef.current = travelRate;

  // computeTotals reads rates from refs so callbacks with stale closures
  // always see the current values without needing them in dep arrays.
  const computeTotals = useCallback(
    (cfg: DbConfig | null, allLines: DbLine[]): MigrationTotals | null => {
      const ba = baRateRef.current;
      const pm = pmRateRef.current;
      const travel = travelRateRef.current;
      if (!cfg || ba == null || pm == null || travel == null) return null;
      const numProjects = NUM(cfg.num_projects);
      const mc: MigrationConfig = {
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
      const pLines = allLines
        .filter((l) => l.section === "project")
        .map((l) => toEngineLine({ ...l, quantity: numProjects }));
      const wLines = allLines.filter((l) => l.section === "workflow").map(toEngineLine);
      const cLines = allLines.filter((l) => l.section === "cost").map(toEngineLine);
      return calculateMigrationTotals(mc, pLines, wLines, cLines, ba, pm, travel);
    },
    [] // refs are always current — no state deps needed
  );

  // ─── Load ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setRateError(null);

      const { data: rates, error: ratesError } = await supabase
        .from("rate_cards")
        .select("lookup_key, rate")
        .in("lookup_key", [
          "Master|Business Analyst",
          "Master|Program Manager",
          "Master|Travel Cost/Trip",
        ]);

      if (ratesError || !rates) {
        setRateError(
          ratesError?.message ??
            "Unable to reach the rate card table. Check your connection and retry."
        );
        setLoading(false);
        return;
      }

      const rateMap = new Map(rates.map((r) => [r.lookup_key, NUM(r.rate)]));
      const ba = rateMap.get("Master|Business Analyst");
      const pm = rateMap.get("Master|Program Manager");
      const travel = rateMap.get("Master|Travel Cost/Trip");

      if (ba == null || pm == null || travel == null) {
        setRateError(
          "One or more required rate card rows are missing (Business Analyst, Program Manager, Travel Cost/Trip). An admin must seed these before migration services can be priced."
        );
        setLoading(false);
        return;
      }

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

  // ─── Save helpers ────────────────────────────────────────────────
  const saveConfig = useCallback(
    async (updated: DbConfig) => {
      const totals = computeTotals(updated, linesRef.current);
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
    [supabase, computeTotals]
  );

  const saveLine = useCallback(
    async (line: DbLine) => {
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
    [supabase]
  );

  const debouncedSaveConfig = useCallback(
    (updated: DbConfig) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveConfig(updated);
      }, 800);
    },
    [saveConfig]
  );

  const debouncedSaveLine = useCallback(
    (line: DbLine) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await saveLine(line);
        if (configRef.current) {
          const totals = computeTotals(configRef.current, linesRef.current);
          if (totals) {
            await supabase
              .from("migration_config")
              .update({
                computed_total_cost: totals.salesPrice,
                updated_at: new Date().toISOString(),
              })
              .eq("id", configRef.current.id);
          }
        }
      }, 800);
    },
    [saveLine, supabase, computeTotals]
  );

  // ─── Unmount save ────────────────────────────────────────────────
  // Flush pending debounced changes when the user navigates away.
  // Fire-and-forget: React cleanup can't await, but in-page SPA
  // navigation keeps in-flight fetches alive.
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      const cfg = configRef.current;
      const currentLines = linesRef.current;
      if (!cfg) return;

      const totals = computeTotals(cfg, currentLines);
      const totalCost = totals?.salesPrice ?? cfg.computed_total_cost;

      supabase
        .from("migration_config")
        .update({
          num_projects: cfg.num_projects,
          hrs_per_import: cfg.hrs_per_import,
          lines_per_import_file: cfg.lines_per_import_file,
          is_effort_included: cfg.is_effort_included,
          is_workshop_included: cfg.is_workshop_included,
          pm_contingency_pct: cfg.pm_contingency_pct,
          ba_complexity_factor: cfg.ba_complexity_factor,
          pm_complexity_factor: cfg.pm_complexity_factor,
          ba_trips: cfg.ba_trips,
          pm_trips: cfg.pm_trips,
          doc_avg_mb_per_project: cfg.doc_avg_mb_per_project,
          doc_mb_per_hour: cfg.doc_mb_per_hour,
          core_requirements_hrs: cfg.core_requirements_hrs,
          core_migration_plan_hrs: cfg.core_migration_plan_hrs,
          core_validation_hrs: cfg.core_validation_hrs,
          core_final_qa_hrs: cfg.core_final_qa_hrs,
          core_pm_oversight_hrs: cfg.core_pm_oversight_hrs,
          computed_total_cost: totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("id", cfg.id);

      for (const line of currentLines) {
        supabase
          .from("migration_detail_lines")
          .update({
            label: line.label,
            quantity: line.quantity,
            items_per_object: line.items_per_object,
            total_line_items: line.total_line_items,
          })
          .eq("id", line.id);
      }
    };
  }, [supabase, computeTotals]);

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
      debouncedSaveConfig(updated);
    },
    [config, debouncedSaveConfig]
  );

  const updateLine = useCallback(
    (lineId: string, field: keyof DbLine, value: string | number) => {
      setLines((prev) => {
        const next = prev.map((l) =>
          l.id === lineId ? { ...l, [field]: value } : l
        );
        const updated = next.find((l) => l.id === lineId);
        if (updated) debouncedSaveLine(updated);
        return next;
      });
    },
    [debouncedSaveLine]
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

      if (data) setLines((prev) => [...prev, data as DbLine]);
    },
    [lines, proposalId, supabase]
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      await supabase.from("migration_detail_lines").delete().eq("id", lineId);
      setLines((prev) => prev.filter((l) => l.id !== lineId));
    },
    [supabase]
  );

  // ─── Derived values ──────────────────────────────────────────────
  const totals = computeTotals(config, lines);
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
