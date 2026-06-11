"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buildMigrationCostMap } from "@/lib/reports/proposal-aggregates";
import {
  fetchMigrationCostInputs,
  fetchRevenueReportBaseRows,
  fetchStatusHistoryMap,
} from "@/lib/reports/data";
import {
  PROPOSAL_STATUSES,
} from "@/lib/constants/statuses";
import { OPEN_PROPOSAL_STATUSES } from "@/lib/proposals/status";
import type { ReportConfig } from "@/lib/reports/report-config";
import { exportReportXLSX } from "@/lib/reports/export-xlsx";
import { ReportFilterBar, type FilterSpec } from "@/components/reports/report-filter-bar";
import { ReportResultsCard } from "@/components/reports/report-results-card";
import { ReportTable } from "@/components/reports/report-table";
import {
  useReportFilterData,
  useReportState,
} from "@/lib/hooks/use-report-state";

type ReportRow = {
  id: string;
  proposalName: string;
  customerName: string;
  status: string;
  p1Cost: number;
  p2Cost: number;
  p3Cost: number;
  p4Cost: number;
  opt1Cost: number;
  opt2Cost: number;
  scopedCost: number;
  migrationCost: number;
  grandTotal: number;
  dateCreated: string | null;
  dateProposalSent: string | null;
  dateWon: string | null;
  daysInCurrentStatus: number | null;
  scopedComplexityFactor: number;
  [key: string]: string | number | null;
};

const REPORT_CONFIG: ReportConfig = {
  title: "Proposal Log Report",
  xlsxTitle: "Rapid Rollout – Proposal Log",
  sheetName: "Proposal Log",
  fileSlug: "proposal-log",
  totalsRow: true,
  columns: [
    { key: "customerName", header: "Customer", width: 24, format: "text" },
    {
      key: "proposalName",
      header: "Proposal Name",
      width: 32,
      format: "link",
      hrefBase: "/proposals",
      hrefKey: "id",
    },
    { key: "status", header: "Proposal Status", width: 20, format: "badge" },
    { key: "dateCreated", header: "Created On", xlsxHeader: "Date Created", width: 13, format: "date" },
    { key: "dateProposalSent", header: "Sent On", xlsxHeader: "Date Proposal Sent", width: 13, format: "date" },
    { key: "dateWon", header: "Won On", xlsxHeader: "Date Won", width: 13, format: "date" },
    { key: "daysInCurrentStatus", header: "Days in Status", xlsxHeader: "Days in Current Status", width: 15, format: "integer" },
    { key: "scopedComplexityFactor", header: "Complexity Factor", width: 12, format: "factor" },
    { key: "p1Cost", header: "Phase 1", width: 15, format: "currency", dashWhenZero: true, sum: true },
    { key: "p2Cost", header: "Phase 2", width: 15, format: "currency", dashWhenZero: true, sum: true },
    { key: "p3Cost", header: "Phase 3", width: 15, format: "currency", dashWhenZero: true, sum: true },
    { key: "p4Cost", header: "Phase 4", width: 15, format: "currency", dashWhenZero: true, sum: true },
    { key: "opt1Cost", header: "Option 1", width: 15, format: "currency", dashWhenZero: true, sum: true },
    { key: "opt2Cost", header: "Option 2", width: 15, format: "currency", dashWhenZero: true, sum: true },
    { key: "scopedCost", header: "Scoped Services", xlsxHeader: "Ad-hoc Services", width: 20, format: "currency", dashWhenZero: true, sum: true },
    { key: "migrationCost", header: "Migration Services", width: 22, format: "currency", dashWhenZero: true, sum: true },
    { key: "grandTotal", header: "Grand Total", width: 18, format: "currency", bold: true, sum: true },
  ],
};

const STATUSES = ["All", ...PROPOSAL_STATUSES];

type OwnerScope = "team" | "mine" | "specific";

function parseStatusPreset(value: string | null): string[] | undefined {
  if (!value || value === "All") return undefined;
  if (value === "open") return [...OPEN_PROPOSAL_STATUSES];
  return value.split(",").map((status) => status.trim()).filter(Boolean);
}

export default function ProposalLogReport() {
  const { supabase, customers, currentUserId } = useReportFilterData();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const {
    statusPreset,
    scopePreset,
    ownerIdPreset,
    dateFromPreset,
    dateToPreset,
    fromDashboard,
  } = useMemo(() => {
    const params = new URLSearchParams(searchParamString);
    return {
      statusPreset: parseStatusPreset(params.get("status")),
      scopePreset: (params.get("scope") as OwnerScope | null) ?? "team",
      ownerIdPreset: params.get("ownerId") ?? undefined,
      dateFromPreset: params.get("dateFrom") ?? undefined,
      dateToPreset: params.get("dateTo") ?? undefined,
      fromDashboard: params.get("from") === "dashboard",
    };
  }, [searchParamString]);

  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState(
    statusPreset?.length === 1 ? statusPreset[0] : "All"
  );
  const { rows, loading, hasRun, run } = useReportState<ReportRow>(
    "Proposal Log report failed to load."
  );

  const runReport = useCallback(async () => {
    await run(async () => {
      const proposals = await fetchRevenueReportBaseRows(supabase, {
        customerId: selectedCustomer !== "all" ? selectedCustomer : undefined,
        status:
          selectedStatus !== "All" && !statusPreset ? selectedStatus : undefined,
        statuses: statusPreset,
        ownerScope: scopePreset,
        currentUserId: currentUserId ?? undefined,
        selectedOwnerId: ownerIdPreset,
        dateColumn: "created_at",
        dateFrom: dateFromPreset,
        dateTo: dateToPreset,
        orderBy: "created_at",
        ascending: false,
      });
      if (proposals.length === 0) return [];

      const proposalIds = proposals.map((p) => p.proposal_id);
      const [migrationInputs, historyMetrics] = await Promise.all([
        fetchMigrationCostInputs(supabase, proposalIds),
        fetchStatusHistoryMap(supabase, proposalIds),
      ]);
      const migrationMap = buildMigrationCostMap(
        migrationInputs.migrationConfigRows,
        migrationInputs.migrationLineRows,
        migrationInputs.rateMap
      );

      return proposals.map((p): ReportRow => {
        const p1 = Number(p.p1_cost) || 0;
        const p2 = Number(p.p2_cost) || 0;
        const p3 = Number(p.p3_cost) || 0;
        const p4 = Number(p.p4_cost) || 0;
        const opt1 = Number(p.opt1_cost) || 0;
        const opt2 = Number(p.opt2_cost) || 0;
        const scoped = Number(p.scoped_total) || 0;
        const migration = migrationMap.get(p.proposal_id) ?? 0;
        const metrics = historyMetrics.get(p.proposal_id);

        return {
          id: p.proposal_id,
          proposalName: p.proposal_name,
          customerName: p.customer_name ?? "—",
          status: p.status,
          p1Cost: p1,
          p2Cost: p2,
          p3Cost: p3,
          p4Cost: p4,
          opt1Cost: opt1,
          opt2Cost: opt2,
          scopedCost: scoped,
          migrationCost: migration,
          grandTotal: p1 + p2 + p3 + p4 + opt1 + opt2 + scoped + migration,
          dateCreated: p.created_at ?? null,
          dateProposalSent: metrics?.firstSentAt ?? null,
          dateWon: metrics?.firstWonAt ?? null,
          daysInCurrentStatus: metrics?.daysInCurrentStatus ?? null,
          scopedComplexityFactor: Number(p.scoped_complexity_factor) || 1,
        };
      });
    });
  }, [
    run,
    supabase,
    selectedCustomer,
    selectedStatus,
    statusPreset,
    scopePreset,
    currentUserId,
    ownerIdPreset,
    dateFromPreset,
    dateToPreset,
  ]);

  useEffect(() => {
    if (!searchParamString) return;
    if (scopePreset === "mine" && !currentUserId) return;
    void runReport();
  }, [currentUserId, runReport, scopePreset, searchParamString]);

  const exportXLSX = useCallback(async () => {
    // XLSX intentionally sorts Status A→Z then Customer A→Z — managers
    // want status-grouped output in the file (screen sorts by customer).
    const sorted = [...rows].sort((a, b) => {
      const sd = a.status.localeCompare(b.status);
      return sd !== 0 ? sd : a.customerName.localeCompare(b.customerName);
    });
    const customerLabel =
      selectedCustomer === "all"
        ? "All Customers"
        : (customers.find((c) => c.id === selectedCustomer)?.company_name ??
          "All Customers");
    const statusLabel =
      statusPreset && statusPreset.length > 1
        ? statusPreset.join(", ")
        : selectedStatus === "All" ? "All Statuses" : selectedStatus;

    await exportReportXLSX(
      REPORT_CONFIG,
      sorted,
      `${customerLabel} and ${statusLabel}`
    );
  }, [rows, selectedCustomer, selectedStatus, statusPreset, customers]);

  // Screen sort: Customer A→Z.
  const screenRows = [...rows].sort((a, b) =>
    a.customerName.localeCompare(b.customerName)
  );
  const appliedPresetLabel = searchParamString
    ? [
        statusPreset?.length ? `Status: ${statusPreset.join(", ")}` : null,
        `Scope: ${scopePreset}`,
        dateFromPreset || dateToPreset
          ? `Date: ${dateFromPreset ?? "start"} to ${dateToPreset ?? "end"}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ")
    : null;

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
      key: "status",
      label: "Status",
      widthClass: "w-[180px]",
      options: STATUSES.map((s) => ({ label: s, value: s })),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">{REPORT_CONFIG.title}</h1>
        {fromDashboard && (
          <Link
            href="/dashboard"
            className="text-sm font-medium text-primary hover:underline"
          >
            Return to Dashboard
          </Link>
        )}
      </div>
      {appliedPresetLabel && (
        <p className="text-sm text-muted-foreground">
          Applied preset: {appliedPresetLabel}
        </p>
      )}

      <ReportFilterBar
        specs={filterSpecs}
        values={{ customer: selectedCustomer, status: selectedStatus }}
        onChange={(key, value) => {
          if (key === "customer") setSelectedCustomer(String(value));
          if (key === "status") setSelectedStatus(String(value));
        }}
        onRun={runReport}
        onExport={exportXLSX}
        loading={loading}
        canExport={rows.length > 0}
      />

      {hasRun && (
        <ReportResultsCard
          count={rows.length}
          emptyMessage="No proposals found matching your filters."
        >
          <ReportTable
            config={REPORT_CONFIG}
            rows={screenRows}
            minWidthClass="min-w-[1120px]"
          />
        </ReportResultsCard>
      )}
    </div>
  );
}
