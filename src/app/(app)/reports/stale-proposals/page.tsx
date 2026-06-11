"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_VARIANT,
  type ProposalStatus,
} from "@/lib/constants/statuses";
import { STALE_TRACKED_STATUSES } from "@/lib/proposals/status";
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

type OwnerFilter = "team" | "mine";
type StaleBucket = "all" | "stale" | "fresh";

type ReportRow = {
  id: string;
  proposalName: string;
  customerName: string;
  status: string;
  daysInStatus: number | null;
  lastActivity: string | null;
  threshold: "stale" | "fresh" | null;
  [key: string]: string | number | null;
};

// Anything sitting more than this in its current status is "stale".
const STALE_THRESHOLD_DAYS = 21;

// In-flight statuses only — closed deals are intentionally excluded from
// "stale" because a closed proposal sitting for 30 days is by design.
const IN_FLIGHT_STATUSES = [...STALE_TRACKED_STATUSES];
const STATUS_OPTIONS = ["All", ...IN_FLIGHT_STATUSES];

// XLSX-only config: the screen table stays bespoke (per-row stale/fresh
// tints, inline badges, group counts) but the export goes through the
// shared workbook engine with conditional row tinting.
const REPORT_CONFIG: ReportConfig = {
  title: "Stale Proposals Report",
  xlsxTitle: "Rapid Rollout – Stale Proposals",
  sheetName: "Stale Proposals",
  fileSlug: "stale-proposals",
  rowTint: { key: "threshold", tints: { stale: "red", fresh: "green" } },
  columns: [
    { key: "proposalName", header: "Proposal Name", width: 32, format: "text" },
    { key: "customerName", header: "Customer", width: 26, format: "text" },
    { key: "status", header: "Current Status", width: 20, format: "text" },
    { key: "daysInStatus", header: "Days in Status", width: 16, format: "integer" },
    { key: "lastActivity", header: "Last Activity", width: 14, format: "date" },
  ],
};

export default function StaleProposalsReport() {
  const { supabase, customers, currentUserId } = useReportFilterData();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const { scopePreset, bucketPreset, statusPreset, fromDashboard } = useMemo(() => {
    const params = new URLSearchParams(searchParamString);
    return {
      scopePreset: (params.get("scope") as OwnerFilter | null) ?? "team",
      bucketPreset: (params.get("bucket") as StaleBucket | null) ?? "all",
      statusPreset: params.get("status") ?? "All",
      fromDashboard: params.get("from") === "dashboard",
    };
  }, [searchParamString]);

  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState(
    STATUS_OPTIONS.includes(statusPreset) ? statusPreset : "All"
  );
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>(scopePreset);
  const [staleBucket, setStaleBucket] = useState<StaleBucket>(bucketPreset);
  const { rows, loading, hasRun, run } = useReportState<ReportRow>(
    "Stale Proposals report failed to load."
  );

  const runReport = useCallback(async () => {
    await run(async () => {
      const proposals = await fetchReportProposals(supabase, {
        customerId: selectedCustomer !== "all" ? selectedCustomer : undefined,
        statuses:
          selectedStatus === "All" ? IN_FLIGHT_STATUSES : [selectedStatus],
        ownerScope: ownerFilter,
        currentUserId: currentUserId ?? undefined,
        includeCreatedBy: true,
      });
      if (proposals.length === 0) return [];

      const proposalIds = proposals.map((p) => p.id);
      const metricsMap = await fetchStatusHistoryMap(supabase, proposalIds);
      const customerMap = new Map(customers.map((c) => [c.id, c.company_name]));

      return proposals
        .map((p): ReportRow => {
          const m = metricsMap.get(p.id);
          const days = m?.daysInCurrentStatus ?? null;
          const threshold: ReportRow["threshold"] =
            days == null
              ? null
              : days >= STALE_THRESHOLD_DAYS
                ? "stale"
                : "fresh";
          return {
            id: p.id,
            proposalName: p.name,
            customerName: customerMap.get(p.customer_id ?? "") ?? "—",
            status: p.status,
            daysInStatus: days,
            lastActivity: m?.lastChangedAt ?? null,
            threshold,
          };
        })
        .filter((row) => {
          if (staleBucket === "stale") return row.threshold === "stale";
          if (staleBucket === "fresh") return row.threshold === "fresh";
          return true;
        })
        // Group by status in the canonical PROPOSAL_STATUSES order, then
        // sort by Proposal Name A→Z within each group.
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
    selectedCustomer,
    selectedStatus,
    ownerFilter,
    staleBucket,
    currentUserId,
    customers,
  ]);

  useEffect(() => {
    if (!searchParamString) return;
    if (ownerFilter === "mine" && !currentUserId) return;
    void runReport();
  }, [currentUserId, ownerFilter, runReport, searchParamString]);

  const exportXLSX = useCallback(async () => {
    const customerLabel =
      selectedCustomer === "all"
        ? "All Customers"
        : (customers.find((c) => c.id === selectedCustomer)?.company_name ??
          "All Customers");
    await exportReportXLSX(
      REPORT_CONFIG,
      rows,
      `${customerLabel} · ${selectedStatus} · ${ownerFilter === "mine" ? "My proposals" : "Team proposals"} · ${staleBucket}  |  Stale when Days in Status >= ${STALE_THRESHOLD_DAYS}`
    );
  }, [rows, selectedCustomer, selectedStatus, ownerFilter, staleBucket, customers]);

  // Rows come in PROPOSAL_STATUSES order already. Map preserves insertion
  // order, so the render order matches the status constant.
  const groupedStale = rows.reduce<Map<string, ReportRow[]>>((map, r) => {
    if (!map.has(r.status)) map.set(r.status, []);
    map.get(r.status)!.push(r);
    return map;
  }, new Map());
  const appliedPresetLabel = searchParamString
    ? `Scope: ${scopePreset} | Bucket: ${bucketPreset} | Status: ${statusPreset}`
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
      options: STATUS_OPTIONS.map((s) => ({ label: s, value: s })),
    },
    {
      kind: "select",
      key: "owner",
      label: "Owner",
      widthClass: "w-[160px]",
      options: [
        { label: "Team Proposals", value: "team" },
        { label: "My Proposals", value: "mine" },
      ],
    },
    {
      kind: "select",
      key: "bucket",
      label: "Bucket",
      widthClass: "w-[150px]",
      options: [
        { label: "All", value: "all" },
        { label: "Stale", value: "stale" },
        { label: "Fresh", value: "fresh" },
      ],
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
        values={{
          customer: selectedCustomer,
          status: selectedStatus,
          owner: ownerFilter,
          bucket: staleBucket,
        }}
        onChange={(key, value) => {
          if (key === "customer") setSelectedCustomer(String(value));
          if (key === "status") setSelectedStatus(String(value));
          if (key === "owner") setOwnerFilter(value as OwnerFilter);
          if (key === "bucket") setStaleBucket(value as StaleBucket);
        }}
        onRun={runReport}
        onExport={exportXLSX}
        loading={loading}
        canExport={rows.length > 0}
      />

      {hasRun && (
        <ReportResultsCard
          count={rows.length}
          titleSuffix={`Amber stale labels indicate proposals that have been in the same status for ${STALE_THRESHOLD_DAYS} days or more.`}
          emptyMessage="No in-flight proposals match these filters."
        >
          <div className="overflow-x-auto rounded-md border">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Proposal Name</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Current Status</TableHead>
                  <TableHead className="text-center">Days in Status</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(groupedStale.entries()).map(([status, group]) => (
                  <Fragment key={`group-${status}`}>
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={5} className="font-semibold">
                        {status} ({group.length})
                      </TableCell>
                    </TableRow>
                    {group.map((r) => (
                      <TableRow
                        key={r.id}
                        className={
                          r.threshold === "stale"
                            ? "bg-amber-50 hover:bg-amber-50/80 dark:bg-amber-950/30 dark:hover:bg-amber-950/40"
                            : r.threshold === "fresh"
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
                              PROPOSAL_STATUS_VARIANT[
                                r.status as ProposalStatus
                              ] ?? "secondary"
                            }
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          <span className="mr-2">{r.daysInStatus ?? "—"}</span>
                          {r.threshold === "stale" && (
                            <Badge variant="amber">Stale</Badge>
                          )}
                          {r.threshold === "fresh" && (
                            <Badge variant="sage">Fresh</Badge>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {formatDateShort(r.lastActivity)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </ReportResultsCard>
      )}
    </div>
  );
}
