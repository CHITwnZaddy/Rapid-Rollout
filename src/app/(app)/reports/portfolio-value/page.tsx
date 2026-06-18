"use client";

import { useCallback, useState } from "react";
import { formatCurrency } from "@/lib/calculations/engine";
import { PROPOSAL_STATUSES } from "@/lib/constants/statuses";
import { buildMigrationCostMap } from "@/lib/reports/proposal-aggregates";
import {
  fetchMigrationCostInputs,
  fetchRevenueReportBaseRows,
} from "@/lib/reports/data";
import type { ReportConfig } from "@/lib/reports/report-config";
import { exportReportXLSX } from "@/lib/reports/export-xlsx";
import {
  ReportFilterBar,
  type FilterSpec,
} from "@/components/reports/report-filter-bar";
import { ReportResultsCard } from "@/components/reports/report-results-card";
import { ReportTable } from "@/components/reports/report-table";
import {
  useReportFilterData,
  useReportState,
} from "@/lib/hooks/use-report-state";

type OwnerFilter = "all" | "mine";

type PortfolioRow = {
  id: string;
  proposalName: string;
  customerName: string;
  status: string;
  scenarioTotal: number;
  scopedTotal: number;
  migrationTotal: number;
  grandTotal: number;
  [key: string]: string | number | null;
};

const REPORT_CONFIG: ReportConfig = {
  title: "Portfolio Value Report",
  xlsxTitle: "Rapid Rollout – Portfolio Value",
  sheetName: "Portfolio Value",
  fileSlug: "portfolio-value",
  totalsRow: true,
  totalsLabel: "Portfolio Total",
  groupBy: "status",
  groupTotals: "header",
  groupLabelBadge: true,
  columns: [
    {
      key: "proposalName",
      header: "Proposal Name",
      width: 32,
      format: "link",
      hrefBase: "/proposals",
      hrefKey: "id",
    },
    { key: "customerName", header: "Customer", width: 26, format: "text" },
    { key: "status", header: "Proposal Status", width: 18, format: "badge" },
    { key: "scenarioTotal", header: "Scenario Total", width: 18, format: "currency", sum: true },
    { key: "scopedTotal", header: "Scoped Services Total", width: 16, format: "currency", sum: true },
    { key: "migrationTotal", header: "Migration Services Total", width: 18, format: "currency", sum: true },
    { key: "grandTotal", header: "Grand Total", width: 18, format: "currency", sum: true },
  ],
};

const FILTER_SPECS: FilterSpec[] = [
  {
    kind: "select",
    key: "owner",
    label: "Owner",
    options: [
      { label: "My Proposals", value: "mine" },
      { label: "All Owners", value: "all" },
    ],
  },
  { kind: "checkbox", key: "includeLost", label: "Include Closed Lost" },
];

export default function PortfolioValueReport() {
  const {
    supabase,
    currentUserId,
    loading: filtersLoading,
    error: filterError,
  } = useReportFilterData();
  // Default to "mine" — the plan called this out as "My Portfolio Value".
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("mine");
  const [includeLost, setIncludeLost] = useState(false);
  const { rows, loading, hasRun, error, run } = useReportState<PortfolioRow>(
    "Portfolio Value report failed to load."
  );
  const resultsError = filterError ?? error;

  const runReport = useCallback(async () => {
    if (filtersLoading || filterError) return;
    await run(async () => {
      const proposals = await fetchRevenueReportBaseRows(supabase, {
        ownerId:
          ownerFilter === "mine" && currentUserId ? currentUserId : undefined,
        excludeStatuses: includeLost ? undefined : ["Closed Lost"],
      });
      if (proposals.length === 0) return [];

      const proposalIds = proposals.map((p) => p.proposal_id);
      const migrationInputs = await fetchMigrationCostInputs(
        supabase,
        proposalIds
      );
      const migrationTotalByProposal = buildMigrationCostMap(
        migrationInputs.migrationConfigRows,
        migrationInputs.migrationLineRows,
        migrationInputs.rateMap
      );

      return proposals
        .map((p): PortfolioRow => {
          const scenarioTotal = Number(p.scenario_total) || 0;
          const scopedTotal = Number(p.scoped_total) || 0;
          const migrationTotal =
            migrationTotalByProposal.get(p.proposal_id) ?? 0;
          return {
            id: p.proposal_id,
            proposalName: p.proposal_name,
            customerName: p.customer_name ?? "—",
            status: p.status,
            scenarioTotal,
            scopedTotal,
            migrationTotal,
            grandTotal: scenarioTotal + scopedTotal + migrationTotal,
          };
        })
        // Group order follows PROPOSAL_STATUSES. Within each group, sort
        // by Proposal Name A→Z. Unknown statuses sink to the bottom.
        .sort((a, b) => {
          const ai = PROPOSAL_STATUSES.indexOf(
            a.status as (typeof PROPOSAL_STATUSES)[number]
          );
          const bi = PROPOSAL_STATUSES.indexOf(
            b.status as (typeof PROPOSAL_STATUSES)[number]
          );
          const aIdx = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
          const bIdx = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
          if (aIdx !== bIdx) return aIdx - bIdx;
          return a.proposalName.localeCompare(b.proposalName);
        });
    });
  }, [
    run,
    supabase,
    ownerFilter,
    includeLost,
    currentUserId,
    filtersLoading,
    filterError,
  ]);

  const overallTotal = rows.reduce((s, r) => s + r.grandTotal, 0);

  const exportXLSX = useCallback(async () => {
    await exportReportXLSX(
      REPORT_CONFIG,
      rows,
      `${ownerFilter === "mine" ? "My proposals" : "All owners"} · ${includeLost ? "Including Closed Lost" : "Excluding Closed Lost"}`
    );
  }, [rows, ownerFilter, includeLost]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{REPORT_CONFIG.title}</h1>

      <ReportFilterBar
        specs={FILTER_SPECS}
        values={{ owner: ownerFilter, includeLost }}
        onChange={(key, value) => {
          if (key === "owner") setOwnerFilter(value as OwnerFilter);
          if (key === "includeLost") setIncludeLost(Boolean(value));
        }}
        onRun={runReport}
        onExport={exportXLSX}
        loading={loading || filtersLoading}
        runDisabled={Boolean(filterError)}
        canExport={!filterError && rows.length > 0}
      />

      {(filterError || hasRun) && (
        <ReportResultsCard
          count={filterError ? 0 : rows.length}
          titleSuffix={`Portfolio Total ${formatCurrency(overallTotal)}`}
          emptyMessage="No proposals match these filters."
          errorMessage={resultsError}
        >
          <ReportTable
            config={REPORT_CONFIG}
            rows={rows}
            minWidthClass="min-w-[900px]"
          />
        </ReportResultsCard>
      )}
    </div>
  );
}
