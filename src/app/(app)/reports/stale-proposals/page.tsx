"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Fragment } from "react";
import {
  buildStatusMetricsMap,
  type StatusHistoryRow,
} from "@/lib/reports/status-history";
import { formatDateShort, toDateOrNull } from "@/lib/reports/format";
import { PROPOSAL_STATUSES } from "@/lib/constants/statuses";
import type ExcelJS from "exceljs";

type Customer = { id: string; company_name: string };
type OwnerFilter = "all" | "mine";

type ReportRow = {
  proposalId: string;
  proposalName: string;
  customerName: string;
  status: string;
  daysInStatus: number | null;
  lastActivity: string | null;
  threshold: "red" | "green" | null;
};

// Anything sitting more than this in its current status is "stale".
const STALE_THRESHOLD_DAYS = 21;

// In-flight statuses only — closed deals are intentionally excluded from
// "stale" because a Won or Lost proposal sitting for 30 days is by design.
const IN_FLIGHT_STATUSES = ["Draft", "Proposal Sent", "Customer Review"];
const STATUS_OPTIONS = ["All", ...IN_FLIGHT_STATUSES];

export default function StaleProposalsReport() {
  const supabase = createClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
    supabase
      .from("customers")
      .select("id, company_name")
      .order("company_name")
      .then(({ data }) => {
        if (data) setCustomers(data);
      });
  }, [supabase]);

  const runReport = useCallback(async () => {
    setLoading(true);
    setHasRun(true);

    let query = supabase
      .from("proposals")
      .select("id, name, status, customer_id, created_by")
      .in(
        "status",
        selectedStatus === "All" ? IN_FLIGHT_STATUSES : [selectedStatus]
      );

    if (selectedCustomer !== "all") {
      query = query.eq("customer_id", selectedCustomer);
    }
    if (ownerFilter === "mine" && currentUserId) {
      query = query.eq("created_by", currentUserId);
    }

    const { data: proposals } = await query;
    if (!proposals || proposals.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const proposalIds = proposals.map((p) => p.id);
    const { data: history } = await supabase
      .from("proposal_status_history")
      .select("proposal_id, old_status, new_status, changed_at")
      .in("proposal_id", proposalIds);

    const metricsMap = buildStatusMetricsMap(
      (history ?? []) as StatusHistoryRow[]
    );
    const customerMap = new Map(customers.map((c) => [c.id, c.company_name]));

    const reportRows: ReportRow[] = proposals
      .map((p) => {
        const m = metricsMap.get(p.id);
        const days = m?.daysInCurrentStatus ?? null;
        const threshold: ReportRow["threshold"] =
          days == null ? null : days >= STALE_THRESHOLD_DAYS ? "red" : "green";
        return {
          proposalId: p.id,
          proposalName: p.name,
          customerName: customerMap.get(p.customer_id ?? "") ?? "—",
          status: p.status,
          daysInStatus: days,
          lastActivity: m?.lastChangedAt ?? null,
          threshold,
        };
      })
      // Group by status in the canonical PROPOSAL_STATUSES order, then sort
      // by Proposal Name A→Z within each group. Only Draft / Proposal Sent /
      // Customer Review ever populate (Won/Lost/VOID are excluded upstream),
      // so the other groups will simply render empty.
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

    setRows(reportRows);
    setLoading(false);
  }, [
    supabase,
    selectedCustomer,
    selectedStatus,
    ownerFilter,
    currentUserId,
    customers,
  ]);

  const exportXLSX = useCallback(async () => {
    if (rows.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Stale Proposals");

    const TITLE_BG = "FFD6E4F7";
    const HEADER_BG = "FFE2E8F0";
    const RED_BG = "FFFBD5D5";
    const GREEN_BG = "FFD5F5E3";
    const WHITE = "FFFFFFFF";
    const ALT_ROW_BG = "FFF0F4FA";

    sheet.columns = [
      { width: 32 }, // A Proposal
      { width: 26 }, // B Customer
      { width: 20 }, // C Current Status
      { width: 16 }, // D Days in Status
      { width: 14 }, // E Last Activity
    ];

    sheet.mergeCells("A1:E1");
    const title = sheet.getCell("A1");
    title.value = "Rapid Rollout – Stale Proposals";
    title.font = { bold: true, size: 22 };
    title.alignment = { horizontal: "center", vertical: "middle" };
    title.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: TITLE_BG },
    };
    sheet.getRow(1).height = 40;

    sheet.mergeCells("A2:E2");
    const filters = sheet.getCell("A2");
    const customerLabel =
      selectedCustomer === "all"
        ? "All Customers"
        : (customers.find((c) => c.id === selectedCustomer)?.company_name ??
          "All Customers");
    filters.value = `Filtered by: ${customerLabel} · ${selectedStatus} · ${ownerFilter === "mine" ? "My proposals" : "All owners"}  |  Red when Days in Status >= ${STALE_THRESHOLD_DAYS}`;
    filters.font = { italic: true, size: 11 };
    filters.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
    sheet.getRow(2).height = 20;
    sheet.getRow(3).height = 8;

    const headers = [
      "Proposal",
      "Customer",
      "Current Status",
      "Days in Status",
      "Last Activity",
    ];
    const hr = sheet.getRow(4);
    headers.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 12 };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: HEADER_BG },
      };
    });
    hr.height = 22;

    const DATA_START = 5;
    rows.forEach((r, idx) => {
      const row = sheet.getRow(DATA_START + idx);
      const fillArgb =
        r.threshold === "red"
          ? RED_BG
          : r.threshold === "green"
            ? GREEN_BG
            : idx % 2 === 0
              ? ALT_ROW_BG
              : WHITE;
      const fill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fillArgb },
      };
      // A-C: text. D: days. E: real Date cell so Excel sort still works.
      const textValues = [r.proposalName, r.customerName, r.status];
      textValues.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.font = { size: 12 };
        c.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
        c.fill = fill;
      });
      const daysCell = row.getCell(4);
      daysCell.value = r.daysInStatus ?? "";
      daysCell.font = { size: 12 };
      daysCell.alignment = { horizontal: "center", vertical: "middle" };
      daysCell.fill = fill;

      const dateCell = row.getCell(5);
      const d = toDateOrNull(r.lastActivity);
      if (d) {
        dateCell.value = d;
        dateCell.numFmt = "dd mmm yy";
      } else {
        dateCell.value = "—";
      }
      dateCell.font = { size: 12 };
      dateCell.alignment = { horizontal: "center", vertical: "middle" };
      dateCell.fill = fill;
      row.height = 18;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stale-proposals-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, selectedCustomer, selectedStatus, ownerFilter, customers]);

  // Rows come in PROPOSAL_STATUSES order already. Reduce into a Map so we
  // can render group-header rows — Map preserves insertion order, so the
  // render order matches the status constant.
  const groupedStale = rows.reduce<Map<string, ReportRow[]>>((map, r) => {
    if (!map.has(r.status)) map.set(r.status, []);
    map.get(r.status)!.push(r);
    return map;
  }, new Map());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Stale Proposals Report</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Customer</Label>
              <Select
                value={selectedCustomer}
                onValueChange={(v) => setSelectedCustomer(v ?? "all")}
              >
                <SelectTrigger className="h-8 w-[220px]">
                  <SelectValue>
                    {selectedCustomer === "all"
                      ? "All Customers"
                      : (customers.find((c) => c.id === selectedCustomer)
                          ?.company_name ?? "All Customers")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={selectedStatus}
                onValueChange={(v) => setSelectedStatus(v ?? "All")}
              >
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Owner</Label>
              <Select
                value={ownerFilter}
                onValueChange={(v) =>
                  setOwnerFilter((v ?? "all") as OwnerFilter)
                }
              >
                <SelectTrigger className="h-8 w-[160px]">
                  <SelectValue>
                    {ownerFilter === "mine" ? "My Proposals" : "All Owners"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  <SelectItem value="mine">My Proposals</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={runReport} disabled={loading}>
              {loading ? "Running..." : "Run Report"}
            </Button>
            {rows.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportXLSX}>
                Export XLSX
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {hasRun && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Results ({rows.length} proposal{rows.length !== 1 ? "s" : ""}) —
              Red rows indicate proposals that have been in the same status for{" "}
              {STALE_THRESHOLD_DAYS} days or more.
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No in-flight proposals match these filters.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
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
                            key={r.proposalId}
                            className={
                              r.threshold === "red"
                                ? "bg-red-100 hover:bg-red-100/80 dark:bg-red-950/40 dark:hover:bg-red-950/50"
                                : r.threshold === "green"
                                  ? "bg-emerald-100 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/50"
                                  : undefined
                            }
                          >
                            <TableCell className="font-medium">
                              {r.proposalName}
                            </TableCell>
                            <TableCell>{r.customerName}</TableCell>
                            <TableCell>{r.status}</TableCell>
                            <TableCell className="text-center tabular-nums">
                              {r.daysInStatus ?? "—"}
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
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
