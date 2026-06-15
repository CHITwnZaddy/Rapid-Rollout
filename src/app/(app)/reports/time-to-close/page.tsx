"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  fetchReportProposals,
  fetchStatusHistoryMap,
} from "@/lib/reports/data";
import { formatDateShort } from "@/lib/reports/format";
import { withinRange } from "@/lib/ui/helpers";
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_VARIANT,
  type ProposalStatus,
} from "@/lib/constants/statuses";
import type { ReportConfig } from "@/lib/reports/report-config";
import { exportReportXLSX } from "@/lib/reports/export-xlsx";
import {
  ReportFilterBar,
  type FilterSpec,
} from "@/components/reports/report-filter-bar";
import { ReportResultsCard } from "@/components/reports/report-results-card";
import {
  useReportFilterData,
  useReportState,
} from "@/lib/hooks/use-report-state";

type ReportRow = {
  id: string;
  proposalName: string;
  customerName: string;
  createdBy: string | null;
  status: string;
  dateSent: string | null;
  dateClosed: string | null;
  daysToClose: number | null;
  threshold: "slow" | "on-track" | null;
  [key: string]: string | number | null;
};

// Threshold (days) used by both the on-screen row color and the XLSX
// conditional fill. Centralised so the two can never disagree.
const CLOSE_THRESHOLD_DAYS = 30;

const STATUSES = ["All", ...PROPOSAL_STATUSES];

type OwnerFilter = "all" | "mine";

// XLSX-only config: the screen table stays bespoke (tints + inline
// badges) but the export goes through the shared workbook engine.
const REPORT_CONFIG: ReportConfig = {
  title: "Time to Close Report",
  xlsxTitle: "Rapid Rollout – Time to Close",
  sheetName: "Time to Close",
  fileSlug: "time-to-close",
  rowTint: { key: "threshold", tints: { slow: "red", "on-track": "green" } },
  columns: [
    { key: "proposalName", header: "Proposal Name", width: 32, format: "text" },
    { key: "customerName", header: "Customer", width: 26, format: "text" },
    { key: "status", header: "Proposal Status", width: 20, format: "text" },
    { key: "dateSent", header: "Date Sent", width: 14, format: "date" },
    { key: "dateClosed", header: "Date Closed", width: 14, format: "date" },
    { key: "daysToClose", header: "Days to Close", width: 16, format: "integer" },
  ],
};

export default function TimeToCloseReport() {
  const { supabase, customers, currentUserId } = useReportFilterData();
  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { rows, loading, hasRun, error, run } = useReportState<ReportRow>(
    "Time to Close report failed to load."
  );

  const runReport = useCallback(async () => {
    await run(async () => {
      const proposals = await fetchReportProposals(supabase, {
        customerId: selectedCustomer !== "all" ? selectedCustomer : undefined,
        status: selectedStatus !== "All" ? selectedStatus : undefined,
        ownerId:
          ownerFilter === "mine" && currentUserId ? currentUserId : undefined,
        includeCreatedBy: true,
        orderBy: "updated_at",
        ascending: false,
      });
      if (proposals.length === 0) return [];

      const proposalIds = proposals.map((p) => p.id);
      const metricsMap = await fetchStatusHistoryMap(supabase, proposalIds);
      const customerMap = new Map(customers.map((c) => [c.id, c.company_name]));

      return proposals
        .map((p): ReportRow => {
          const m = metricsMap.get(p.id);
          // The terminal date prefers Closed Won, then falls back to the
          // last transition when the proposal is currently Closed Lost.
          const dateClosed =
            m?.firstWonAt ??
            (p.status === "Closed Lost" ? (m?.lastChangedAt ?? null) : null);

          const threshold: ReportRow["threshold"] =
            m?.daysToClose == null
              ? null
              : m.daysToClose > CLOSE_THRESHOLD_DAYS
                ? "slow"
                : "on-track";

          return {
            id: p.id,
            proposalName: p.name,
            customerName: customerMap.get(p.customer_id ?? "") ?? "—",
            createdBy: p.created_by ?? null,
            status: p.status,
            dateSent: m?.firstSentAt ?? null,
            dateClosed,
            daysToClose: m?.daysToClose ?? null,
            threshold,
          };
        })
        // Date-range filter operates on the "sent" date — the clock-start
        // for time-to-close — not on created_at.
        .filter((r) =>
          fromDate || toDate ? withinRange(r.dateSent, fromDate, toDate) : true
        );
    });
  }, [
    run,
    supabase,
    selectedCustomer,
    selectedStatus,
    ownerFilter,
    currentUserId,
    customers,
    fromDate,
    toDate,
  ]);

  // Screen + XLSX share one sort: worst offenders (longest daysToClose)
  // first. Open proposals (null) sink to the bottom so the top of the
  // table is always actionable.
  const sortedRows = [...rows].sort((a, b) => {
    const aDays = a.daysToClose ?? Number.NEGATIVE_INFINITY;
    const bDays = b.daysToClose ?? Number.NEGATIVE_INFINITY;
    return bDays - aDays;
  });

  const exportXLSX = useCallback(async () => {
    const sorted = [...rows].sort((a, b) => {
      const aDays = a.daysToClose ?? Number.NEGATIVE_INFINITY;
      const bDays = b.daysToClose ?? Number.NEGATIVE_INFINITY;
      return bDays - aDays;
    });
    const customerLabel =
      selectedCustomer === "all"
        ? "All Customers"
        : (customers.find((c) => c.id === selectedCustomer)?.company_name ??
          "All Customers");
    const rangeLabel =
      fromDate || toDate ? `${fromDate || "…"} → ${toDate || "…"}` : "All dates";
    await exportReportXLSX(
      REPORT_CONFIG,
      sorted,
      `${customerLabel} · ${selectedStatus} · ${ownerFilter === "mine" ? "My proposals" : "All owners"} · Sent ${rangeLabel}`
    );
  }, [rows, selectedCustomer, selectedStatus, ownerFilter, fromDate, toDate, customers]);

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
    { kind: "date", key: "fromDate", label: "Sent From" },
    { kind: "date", key: "toDate", label: "Sent To" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{REPORT_CONFIG.title}</h1>

      <ReportFilterBar
        specs={filterSpecs}
        values={{
          customer: selectedCustomer,
          status: selectedStatus,
          owner: ownerFilter,
          fromDate,
          toDate,
        }}
        onChange={(key, value) => {
          if (key === "customer") setSelectedCustomer(String(value));
          if (key === "status") setSelectedStatus(String(value));
          if (key === "owner") setOwnerFilter(value as OwnerFilter);
          if (key === "fromDate") setFromDate(String(value));
          if (key === "toDate") setToDate(String(value));
        }}
        onRun={runReport}
        onExport={exportXLSX}
        loading={loading}
        canExport={rows.length > 0}
      />

      {hasRun && (
        <ReportResultsCard
          count={rows.length}
          titleSuffix={`amber rows closed in >${CLOSE_THRESHOLD_DAYS} days`}
          emptyMessage="No proposals match these filters."
          errorMessage={error}
        >
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Proposal</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date Sent</TableHead>
                  <TableHead>Date Closed</TableHead>
                  <TableHead className="text-right">Days to Close</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((r) => (
                  <TableRow
                    key={r.id}
                    className={
                      r.threshold === "slow"
                        ? "bg-amber-50 hover:bg-amber-50/80 dark:bg-amber-950/30 dark:hover:bg-amber-950/40"
                        : r.threshold === "on-track"
                          ? "bg-emerald-50 hover:bg-emerald-50/80 dark:bg-emerald-950/25 dark:hover:bg-emerald-950/35"
                          : "hover:bg-muted/50"
                    }
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/proposals/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        {r.proposalName}
                      </Link>
                    </TableCell>
                    <TableCell>{r.customerName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          PROPOSAL_STATUS_VARIANT[r.status as ProposalStatus] ??
                          "secondary"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {formatDateShort(r.dateSent)}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {formatDateShort(r.dateClosed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className="mr-2">{r.daysToClose ?? "—"}</span>
                      {r.threshold === "slow" && (
                        <Badge variant="amber">Slow close</Badge>
                      )}
                      {r.threshold === "on-track" && (
                        <Badge variant="sage">On track</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ReportResultsCard>
      )}
    </div>
  );
}
