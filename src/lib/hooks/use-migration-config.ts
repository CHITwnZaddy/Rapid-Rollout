import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  importCapacityError,
  lineItemsBoundsError,
  type MigrationTotals,
} from "@/lib/calculations/migration-engine";
import { NUM } from "@/lib/calculations/num";
import { fetchRequiredRates } from "@/lib/supabase/queries";
import { createMigrationPersistenceController } from "./migration-persistence";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";
import {
  computeMigrationTotalsFromState,
  type MigrationConfigState,
  type MigrationLineState,
} from "@/lib/migration/compute-totals-from-state";
import {
  addMigrationDetailLine,
  removeMigrationDetailLine,
} from "@/app/(app)/proposals/[id]/migration/actions";
import { type MigrationSection } from "@/lib/validation/migration";

export type DbConfig = MigrationConfigState & {
  id: string;
  proposal_id: string;
  computed_total_cost: number;
};

export type DbLine = MigrationLineState;

export type UseMigrationConfigReturn = {
  config: DbConfig | null;
  lines: DbLine[];
  srImRate: number | null;
  pmRate: number | null;
  travelRate: number | null;
  internalCostRate: number | null;
  rateError: string | null;
  loadError: string | null;
  saveError: string | null;
  saveStatus: "idle" | "saving" | "saved" | "error";
  loading: boolean;
  totals: MigrationTotals | null;
  numProjects: number;
  projectLines: DbLine[];
  workflowLines: DbLine[];
  costLines: DbLine[];
  isMutatingRows: boolean;
  mutatingSection: MigrationSection | null;
  removingLineId: string | null;
  updateConfig: (field: keyof DbConfig, value: number | boolean | string) => void;
  updateLine: (lineId: string, field: keyof DbLine, value: string | number) => void;
  addLine: (section: MigrationSection) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  retryPendingSaves: () => Promise<void>;
  clearSaveError: () => void;
  retry: () => void;
};

export function useMigrationConfig(proposalId: string): UseMigrationConfigReturn {
  const supabase = createClient();

  const [config, setConfig] = useState<DbConfig | null>(null);
  const [lines, setLines] = useState<DbLine[]>([]);
  const [srImRate, setSrImRate] = useState<number | null>(null);
  const [pmRate, setPmRate] = useState<number | null>(null);
  const [travelRate, setTravelRate] = useState<number | null>(null);
  const [internalCostRate, setInternalCostRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [isMutatingRows, setIsMutatingRows] = useState(false);
  const [mutatingSection, setMutatingSection] = useState<MigrationSection | null>(null);
  const [removingLineId, setRemovingLineId] = useState<string | null>(null);

  // Refs for closure-safe access to latest values in callbacks/cleanup
  const configRef = useRef(config);
  const linesRef = useRef(lines);
  const srImRateRef = useRef(srImRate);
  const pmRateRef = useRef(pmRate);
  const travelRateRef = useRef(travelRate);
  const internalCostRateRef = useRef(internalCostRate);
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
    srImRateRef.current = srImRate;
  }, [srImRate]);

  useEffect(() => {
    pmRateRef.current = pmRate;
  }, [pmRate]);

  useEffect(() => {
    travelRateRef.current = travelRate;
  }, [travelRate]);

  useEffect(() => {
    internalCostRateRef.current = internalCostRate;
  }, [internalCostRate]);

  const getCurrentRateSnapshot = useCallback(() => ({
    srImRate: srImRateRef.current,
    pmRate: pmRateRef.current,
    travelRate: travelRateRef.current,
    internalCostRate: internalCostRateRef.current,
  }), []);

  const syncCanonicalLines = useCallback((nextLines: DbLine[]) => {
    setLines(nextLines);
    linesRef.current = nextLines;
  }, []);

  useEffect(() => {
    persistenceControllerRef.current = createMigrationPersistenceController({
      getSnapshot: () => ({
        config: configRef.current,
        lines: linesRef.current,
      }),
      onStatusChange: (status) => {
        setSaveStatus(status);
      },
      onError: (error) => {
        const message =
          error instanceof Error ? error.message : "Unknown migration save error.";
        setSaveError(message);
      },
      saveConfig: async (updated, currentLines) => {
        const capacityError = importCapacityError(NUM(updated.lines_per_import_file));
        if (capacityError) {
          throw new Error(capacityError);
        }

        const totals = computeMigrationTotalsFromState(
          updated,
          currentLines,
          getCurrentRateSnapshot()
        );
        const totalCost = totals?.clientPrice ?? 0;

        const { error } = await supabase
          .from("migration_config")
          .update({
            num_projects: updated.num_projects,
            hrs_per_import: updated.hrs_per_import,
            lines_per_import_file: updated.lines_per_import_file,
            is_effort_included: updated.is_effort_included,
            is_workshop_included: updated.is_workshop_included,
            complexity_factor: updated.complexity_factor,
            sr_im_trips: updated.sr_im_trips,
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

        if (error) {
          throw new Error(`Couldn't save migration configuration. ${error.message}`);
        }
      },
      saveLine: async (line) => {
        const { error } = await supabase
          .from("migration_detail_lines")
          .update({
            label: line.label,
            quantity: line.quantity,
            items_per_object: line.items_per_object,
            total_line_items: line.total_line_items,
          })
          .eq("id", line.id);

        if (error) {
          throw new Error(`Couldn't save migration detail row. ${error.message}`);
        }
      },
      saveComputedTotal: async (updated, currentLines) => {
        const capacityError = importCapacityError(NUM(updated.lines_per_import_file));
        if (capacityError) {
          throw new Error(capacityError);
        }

        const totals = computeMigrationTotalsFromState(
          updated,
          currentLines,
          getCurrentRateSnapshot()
        );

        const { error } = await supabase
          .from("migration_config")
          .update({
            computed_total_cost: totals?.clientPrice ?? updated.computed_total_cost,
            updated_at: new Date().toISOString(),
          })
          .eq("id", updated.id);

        if (error) {
          throw new Error(`Couldn't recompute migration totals. ${error.message}`);
        }
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
  }, [getCurrentRateSnapshot, supabase]);

  // ─── Load ────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setRateError(null);
      setLoadError(null);
      setSaveError(null);
      setSaveStatus("idle");

      const ratesResult = await fetchRequiredRates(supabase, [
        SR_IM_RATE_KEY,
        PM_RATE_KEY,
        TRAVEL_RATE_KEY,
        INTERNAL_COST_RATE_KEY,
      ]);
      if (!ratesResult.ok) {
        setRateError(ratesResult.error);
        setLoading(false);
        return;
      }
      const srIm = ratesResult.rates.get(SR_IM_RATE_KEY)!;
      const pm = ratesResult.rates.get(PM_RATE_KEY)!;
      const travel = ratesResult.rates.get(TRAVEL_RATE_KEY)!;
      const internalCost = ratesResult.rates.get(INTERNAL_COST_RATE_KEY)!;
      setSrImRate(srIm);
      setPmRate(pm);
      setTravelRate(travel);
      setInternalCostRate(internalCost);

      const { data: cfg } = await supabase
        .from("migration_config")
        .select("*")
        .eq("proposal_id", proposalId)
        .single();

      if (!cfg) {
        setLoadError(
          "This proposal is missing its migration configuration row. New proposals should no longer enter this state, so this likely indicates legacy bad data."
        );
        setLoading(false);
        return;
      }

      if (cfg) setConfig(cfg as DbConfig);

      const { data: existingLines } = await supabase
        .from("migration_detail_lines")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("section")
        .order("row_order");

      if (!existingLines || existingLines.length === 0) {
        setLoadError(
          "This proposal is missing its migration detail rows. New proposals should no longer enter this state, so this likely indicates legacy bad data."
        );
        setLoading(false);
        return;
      }

      if (existingLines) syncCanonicalLines(existingLines as DbLine[]);
      setLoading(false);
    };
    load();
  }, [proposalId, supabase, reloadToken, syncCanonicalLines]);

  // ─── Update helpers ──────────────────────────────────────────────
  const updateConfig = useCallback(
    (field: keyof DbConfig, value: number | boolean | string) => {
      if (!config) return;
      setSaveError(null);

      if (field === "lines_per_import_file") {
        const capacityError = importCapacityError(NUM(value));
        if (capacityError) {
          setSaveError(capacityError);
          return;
        }
      }

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
      setSaveError(null);

      // Bounds guard: reject quantity/items-per-object edits that would
      // blow past MAX_TOTAL_LINE_ITEMS before they reach state or the DB.
      if (field === "quantity" || field === "items_per_object") {
        const current = linesRef.current.find((l) => l.id === lineId);
        if (current) {
          const candidate = { ...current, [field]: NUM(value) };
          const boundsError = lineItemsBoundsError(
            NUM(candidate.quantity),
            NUM(candidate.items_per_object)
          );
          if (boundsError) {
            setSaveError(boundsError);
            return;
          }
        }
      }

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

  const runRowMutation = useCallback(
    async (
      options:
        | {
            kind: "add";
            section: MigrationSection;
          }
        | {
            kind: "remove";
            lineId: string;
          }
    ) => {
      setSaveError(null);
      setSaveStatus("saving");
      setIsMutatingRows(true);
      setMutatingSection(options.kind === "add" ? options.section : null);
      setRemovingLineId(options.kind === "remove" ? options.lineId : null);

      try {
        const flushed = (await persistenceControllerRef.current?.flushNow()) ?? true;
        if (!flushed) {
          return;
        }

        const result =
          options.kind === "add"
            ? await addMigrationDetailLine(proposalId, options.section)
            : await removeMigrationDetailLine(proposalId, options.lineId);
        if (!result.ok) {
          setSaveStatus("error");
          setSaveError(result.error);
          return;
        }

        syncCanonicalLines(result.lines);
        setSaveStatus("saved");
      } finally {
        setIsMutatingRows(false);
        setMutatingSection(null);
        setRemovingLineId(null);
      }
    },
    [proposalId, syncCanonicalLines]
  );

  const addLine = useCallback(
    async (section: MigrationSection) => {
      await runRowMutation({ kind: "add", section });
    },
    [runRowMutation]
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      await runRowMutation({ kind: "remove", lineId });
    },
    [runRowMutation]
  );

  // ─── Derived values ──────────────────────────────────────────────
  const totals = computeMigrationTotalsFromState(
    config,
    lines,
    {
      srImRate,
      pmRate,
      travelRate,
      internalCostRate,
    }
  );
  const numProjects = NUM(config?.num_projects);
  const projectLines = lines.filter((l) => l.section === "project");
  const workflowLines = lines.filter((l) => l.section === "workflow");
  const costLines = lines.filter((l) => l.section === "cost");

  return {
    config,
    lines,
    srImRate,
    pmRate,
    travelRate,
    internalCostRate,
    rateError,
    loadError,
    saveError,
    saveStatus,
    loading,
    totals,
    numProjects,
    projectLines,
    workflowLines,
    costLines,
    isMutatingRows,
    mutatingSection,
    removingLineId,
    updateConfig,
    updateLine,
    addLine,
    removeLine,
    retryPendingSaves: async () => {
      setSaveError(null);
      const flushed = (await persistenceControllerRef.current?.flushNow()) ?? true;
      if (flushed && saveStatus === "error") {
        setSaveStatus("idle");
      }
    },
    clearSaveError: () => {
      setSaveError(null);
      if (saveStatus === "error") {
        setSaveStatus("idle");
      }
    },
    retry: () => setReloadToken((n) => n + 1),
  };
}
