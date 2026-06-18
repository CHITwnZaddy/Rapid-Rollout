"use client";

import { useCallback, useState } from "react";
import {
  buildMigrationHoursMap,
  buildScopedHoursMap,
} from "@/lib/reports/proposal-aggregates";
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

// A single (proposal, scenario-or-bucket) row. "scenario" stores the
// internal code or synthetic bucket; "scenarioLabel" is the display name.
type HoursRow = {
  id: string;
  proposalName: string;
  customerName: string;
  scenario: string;
  scenarioLabel: string;
  srImHours: number;
  pmHours: number;
  baHours: number;
  totalHours: number;
  [key: string]: string | number | null;
};

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
      hrefKey: "id",
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
  "Scoped Services",
  "Migration Services",
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
  const { rows, loading, hasRun, error, run } = useReportState<HoursRow>(
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

      const customerMap = new Map(customers.map((c) => [c.id, c.company_name]));
      const lineSumByScenario = new Map<
        string,
        { sr: number; pm: number; ba: number }
      >();
      for (const l of aggregateInputs.scenarioLineRows) {
        const agg = lineSumByScenario.get(l.scenario_id) ?? { sr: 0, pm: 0, ba: 0 };
        agg.sr += Number(l.sr_im_hours) || 0;
        agg.pm += Number(l.pm_hours) || 0;
        agg.ba += Number(l.ba_hours) || 0;
        lineSumByScenario.set(l.scenario_id, agg);
      }

      const scopedByProposal = buildScopedHoursMap(aggregateInputs.scopedRows);
      const migrationByProposal = buildMigrationHoursMap(
        aggregateInputs.migrationConfigRows,
        aggregateInputs.migrationLineRows,
        aggregateInputs.rateMap
      );

      const out: HoursRow[] = [];
      const customerName = (cid: string | null) =>
        customerMap.get(cid ?? "") ?? "—";
      const pushRow = (
        p: { id: string; name: string; customer_id: string | null },
        scenario: string,
        sr: number,
        pm: number,
        ba: number
      ) => {
        out.push({
          id: p.id,
          proposalName: p.name,
          customerName: customerName(p.customer_id),
          scenario,
          scenarioLabel: getScenarioDisplayName(scenario),
          srImHours: sr,
          pmHours: pm,
          baHours: ba,
          totalHours: sr + pm + ba,
        });
      };

      const scenariosByProposal = new Map<
        string,
        { id: string; type: string }[]
      >();
      for (const s of aggregateInputs.scenarioRows) {
        if (!scenariosByProposal.has(s.proposal_id))
          scenariosByProposal.set(s.proposal_id, []);
        scenariosByProposal
          .get(s.proposal_id)!
          .push({ id: s.id, type: s.scenario_type });
      }

      const sortedProposals = [...proposals].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      for (const p of sortedProposals) {
        const pScenarios = (scenariosByProposal.get(p.id) ?? []).sort(
          (a, b) =>
            SCENARIO_ORDER.indexOf(a.type as (typeof SCENARIO_ORDER)[number]) -
            SCENARIO_ORDER.indexOf(b.type as (typeof SCENARIO_ORDER)[number])
        );
        for (const s of pScenarios) {
          const sums = lineSumByScenario.get(s.id) ?? { sr: 0, pm: 0, ba: 0 };
          pushRow(p, s.type, sums.sr, sums.pm, sums.ba);
        }
        const sc = scopedByProposal.get(p.id);
        if (sc && (sc.sr || sc.pm || sc.ba)) {
          pushRow(p, "Scoped Services", sc.sr, sc.pm, sc.ba);
        }
        const mig = migrationByProposal.get(p.id);
        if (mig && (mig.pm || mig.srIm)) {
          pushRow(p, "Migration Services", mig.srIm, mig.pm, 0);
        }
      }

      return selectedScenario === "All"
        ? out
        : out.filter((r) => r.scenario === selectedScenario);
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
