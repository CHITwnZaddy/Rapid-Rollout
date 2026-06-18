import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { exportScenarioBreakoutXLSX } from "@/lib/exports/scenario-breakout";
import { fetchRequiredRates } from "@/lib/supabase/queries";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";
import {
  loadScenarioBreakoutData,
  type MigrationConfig,
  type MigrationLine,
  type Proposal,
  type ScenarioGroup,
  type ScopedLine,
} from "@/lib/reports/scenario-breakout-data";
import { type MigrationBreakdownRow } from "@/lib/reports/migration-breakdown";

export type {
  MigrationConfig,
  MigrationLine,
  Proposal,
  ScenarioGroup,
  ScenarioLine,
  ScopedLine,
} from "@/lib/reports/scenario-breakout-data";

export function useScenarioBreakout() {
  const supabase = createClient();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState("");
  const [scenarioGroups, setScenarioGroups] = useState<ScenarioGroup[]>([]);
  const [scopedLines, setScopedLines] = useState<ScopedLine[]>([]);
  const [migrationConfig, setMigrationConfig] = useState<MigrationConfig | null>(null);
  const [migrationLines, setMigrationLines] = useState<MigrationLine[]>([]);
  const [migrationBreakdownRows, setMigrationBreakdownRows] = useState<
    MigrationBreakdownRow[]
  >([]);
  // Rates are fail-closed: start as null and require a successful
  // fetch before the report can run.
  const [srImRate, setSrImRate] = useState<number | null>(null);
  const [pmRate, setPmRate] = useState<number | null>(null);
  const [travelRate, setTravelRate] = useState<number | null>(null);
  const [internalCostRate, setInternalCostRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [rateReloadToken, setRateReloadToken] = useState(0);
  const [migrationLiveTotal, setMigrationLiveTotal] = useState(0);

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
      SR_IM_RATE_KEY,
      PM_RATE_KEY,
      TRAVEL_RATE_KEY,
      INTERNAL_COST_RATE_KEY,
    ]).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setRateError(result.error);
        return;
      }
      setRateError(null);
      setSrImRate(result.rates.get(SR_IM_RATE_KEY)!);
      setPmRate(result.rates.get(PM_RATE_KEY)!);
      setTravelRate(result.rates.get(TRAVEL_RATE_KEY)!);
      setInternalCostRate(result.rates.get(INTERNAL_COST_RATE_KEY)!);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, rateReloadToken]);

  const ratesReady =
    srImRate != null &&
    pmRate != null &&
    travelRate != null &&
    internalCostRate != null &&
    !rateError;

  const runReport = useCallback(async () => {
    if (!selectedProposal) return;
    if (
      srImRate == null ||
      pmRate == null ||
      travelRate == null ||
      internalCostRate == null ||
      rateError
    ) {
      setHasRun(true);
      setError(rateError ?? "Required pricing rates have not loaded.");
      return;
    }

    setLoading(true);
    setHasRun(true);
    setError(null);

    try {
      const result = await loadScenarioBreakoutData(supabase, selectedProposal, {
        srImRate,
        pmRate,
        travelRate,
        internalCostRate,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setScenarioGroups(result.scenarioGroups);
      setScopedLines(result.scopedLines);
      setMigrationConfig(result.migrationConfig);
      setMigrationLines(result.migrationLines);
      setMigrationBreakdownRows(result.migrationBreakdownRows);
      setMigrationLiveTotal(result.migrationLiveTotal);
    } finally {
      setLoading(false);
    }
  }, [
    supabase,
    selectedProposal,
    srImRate,
    pmRate,
    travelRate,
    internalCostRate,
    rateError,
  ]);

  const exportXLSX = useCallback(async () => {
    const proposalName =
      proposals.find((p) => p.id === selectedProposal)?.name ?? "report";
    await exportScenarioBreakoutXLSX({
      proposalName,
      scenarioGroups,
      scopedLines,
      migrationRows: migrationBreakdownRows,
      migrationGrandTotal: migrationLiveTotal,
    });
  }, [
    scenarioGroups,
    scopedLines,
    migrationBreakdownRows,
    migrationLiveTotal,
    proposals,
    selectedProposal,
  ]);

  return {
    proposals,
    selectedProposal,
    setSelectedProposal,
    scenarioGroups,
    scopedLines,
    migrationConfig,
    migrationLines,
    migrationBreakdownRows,
    srImRate,
    pmRate,
    rateError,
    error,
    loading,
    hasRun,
    ratesReady,
    migrationLiveTotal,
    runReport,
    exportXLSX,
    retryRates: () => setRateReloadToken((n) => n + 1),
  };
}
