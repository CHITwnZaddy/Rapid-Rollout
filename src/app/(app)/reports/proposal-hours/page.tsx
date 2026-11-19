"use client";

import { useCallback, useState } from "react";
import {
  buildMigrationHoursMap,
  buildScopedHoursMap,
} from "@/lib/reports/proposal-aggregates";
import {
  buildProposalHoursRows,
  MIGRATION_SERVICES_BUCKET,
  SCOPED_SERVICES_BUCKET,
  type ProposalHoursRow,
} from "@/lib/reports/proposal-hours";
import {
  fetchHoursAggregateInputs,
  fetchReportProposals,
} from "@/lib/reports/data";
import { getScenarioDisplayName, SCENARIO_ORDER } from "@/lib/scenarios/display";
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

const REPORT_CONFIG: ReportConfig = {
  title: "Proposal Hours Report",
  xlsxTitle: "Rapid Rollout – Proposal Hours",
  sheetName: "Proposal Hours",
  fileSlug: "proposal-hours",
  totalsRow: true,
  totalsLabel: "Totals",
  columns: [
    {
      key: "proposalName",
      header: "Proposal Name",
      width: 32,
      format: "link",
      hrefBase: "/proposals",
      // Row ids are composite (proposal:scenario); link by proposal id.
      hrefKey: "proposalId",
    },
    { key: "customerName", header: "Customer", width: 26, format: "text" },
    { key: "scenarioLabel", header: "Scenario", width: 20, format: "text" },
    { key: "srImHours", header: "Sr IM Hours", width: 14, format: "hours", sum: true },
    { key: "pmHours", header: "PM Hours", width: 14, format: "hours", sum: true },
    { key: "baHours", header: "BA Hours", width: 14, format: "hours", sum: true },
    { key: "totalHours", header: "Total Hours", width: 14, format: "hours", sum: true },
  ],
};

const SCENARIO_FILTER = [
  "All",
  ...SCENARIO_ORDER,
  SCOPED_SERVICES_BUCKET,
  MIGRATION_SERVICES_BUCKET,
];

function scenarioFilterLabel(value: string): string {
  return value === "All" ? "All" : getScenarioDisplayName(value);
}

export default function ProposalHoursReport() {
  const {
    supabase,
    customers,
    currentUserId,
    loading: filtersLoading,
    error: filterError,
  } = useReportFilterData();
  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedScenario, setSelectedScenario] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const { rows, loading, hasRun, error, run } = useReportState<ProposalHoursRow>(
    "Proposal Hours report failed to load."
  );
  const resultsError = filterError ?? error;

  const runReport = useCallback(async () => {
    if (filtersLoading || filterError) return;
    await run(async () => {
      const proposals = await fetchReportProposals(supabase, {
        customerId: selectedCustomer !== "all" ? selectedCustomer : undefined,
        ownerId:
          ownerFilter === "mine" && currentUserId ? currentUserId : undefined,
        includeCreatedBy: true,
      });
      if (proposals.length === 0) return [];

      const proposalIds = proposals.map((p) => p.id);
      const aggregateInputs = await fetchHoursAggregateInputs(
        supabase,
        proposalIds
      );

      // Kept inside run() so a missing-rate throw from buildMigrationHoursMap
      // still reaches the error toast.
      return buildProposalHoursRows({
        proposals,
        customerNames: new Map(customers.map((c) => [c.id, c.company_name])),
        scenarioRows: aggregateInputs.scenarioRows,
        scenarioLineRows: aggregateInputs.scenarioLineRows,
        scopedHours: buildScopedHoursMap(aggregateInputs.scopedRows),
        migrationHours: buildMigrationHoursMap(
          aggregateInputs.migrationConfigRows,
          aggregateInputs.migrationLineRows,
          aggregateInputs.rateMap
        ),
        selectedScenario,
      });
    });
  }, [
    run,
    supabase,
    selectedCustomer,
    selectedScenario,
    ownerFilter,
    currentUserId,
    customers,
    filtersLoading,
    filterError,
  ]);

  const exportXLSX = useCallback(async () => {
    const customerLabel =
      selectedCustomer === "all"
        ? "All Customers"
        : (customers.find((c) => c.id === selectedCustomer)?.company_name ??
          "All Customers");
    await exportReportXLSX(
      REPORT_CONFIG,
      rows,
      `${customerLabel} · ${scenarioFilterLabel(selectedScenario)} · ${ownerFilter === "mine" ? "My proposals" : "All owners"}`
    );
  }, [rows, selectedCustomer, selectedScenario, ownerFilter, customers]);

  const filterSpecs: FilterSpec[] = [
    {
      kind: "select",
      key: "customer",
      label: "Customer",
      widthClass: "w-[220px]",
      options: [
        { label: "All Customers", value: "all" },
        ...customers.map((c) => ({ label: c.company_name, value: c.id })),
      ],
    },
    {
      kind: "select",
      key: "scenario",
      label: "Scenario",
      widthClass: "w-[180px]",
      options: SCENARIO_FILTER.map((s) => ({
        label: scenarioFilterLabel(s),
        value: s,
      })),
    },
    {
      kind: "select",
      key: "owner",
      label: "Owner",
      widthClass: "w-[160px]",
      options: [
        { label: "All Owners", value: "all" },
        { label: "My Proposals", value: "mine" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{REPORT_CONFIG.title}</h1>

      <ReportFilterBar
        specs={filterSpecs}
        values={{
          customer: selectedCustomer,
          scenario: selectedScenario,
          owner: ownerFilter,
        }}
        onChange={(key, value) => {
          if (key === "customer") setSelectedCustomer(String(value));
          if (key === "scenario") setSelectedScenario(String(value));
          if (key === "owner") setOwnerFilter(value as OwnerFilter);
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
          noun="row"
          emptyMessage="No hours data matches these filters."
          errorMessage={resultsError}
        >
          <ReportTable config={REPORT_CONFIG} rows={rows} />
        </ReportResultsCard>
      )}
    </div>
  );
}
