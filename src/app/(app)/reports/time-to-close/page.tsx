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
import { Input } from "@/components/ui/input";
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
import { fetchStatusHistoryMap } from "@/lib/reports/data";
import { formatDateShort, toDateOrNull } from "@/lib/reports/format";
import { withinRange } from "@/lib/ui/helpers";
import type ExcelJS from "exceljs";

type Customer = { id: string; company_name: string };

type ReportRow = {
  proposalId: string;
  proposalName: string;
  customerName: string;
  createdBy: string | null;
  status: string;
  dateSent: string | null;
  dateClosed: string | null;
  daysToClose: number | null;
  // "red" when daysToClose > 30, "green" when <= 30, null when not yet closed.
  threshold: "red" | "green" | null;
};

// Threshold (days) used by both the on-screen row color and the XLSX
// conditional fill. Centralised so the two can never disagree.
const CLOSE_THRESHOLD_DAYS = 30;

const STATUSES = ["All", "Won", "Lost", "Proposal Sent", "Customer Review"];

type OwnerFilter = "all" | "mine";

export default function TimeToCloseReport() {
  const supabase = createClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
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
      .order("updated_at", { ascending: false });

    if (selectedCustomer !== "all") {
      query = query.eq("customer_id", selectedCustomer);
    }
    if (selectedStatus !== "All") {
      query = query.eq("status", selectedStatus);
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
    const metricsMap = await fetchStatusHistoryMap(supabase, proposalIds);
    const customerMap = new Map(customers.map((c) => [c.id, c.company_name]));

    const reportRows: ReportRow[] = proposals
      .map((p) => {
        const m = metricsMap.get(p.id);
        // The terminal date — prefer Won, then fall back to the last
        // transition if the proposal is currently Lost.
        const dateClosed =
          m?.firstWonAt ??
          (p.status === "Lost" ? (m?.lastChangedAt ?? null) : null);

        const threshold: ReportRow["threshold"] =
          m?.daysToClose == null
            ? null
            : m.daysToClose > CLOSE_THRESHOLD_DAYS
              ? "red"
              : "green";

        return {
          proposalId: p.id,
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
      // for time-to-close — not on created_at, so "Q2 sends" means exactly that.
      .filter((r) =>
        fromDate || toDate ? withinRange(r.dateSent, fromDate, toDate) : true
      );

    setRows(reportRows);
    setLoading(false);
  }, [
    supabase,
    selectedCustomer,
    selectedStatus,
    ownerFilter,
    currentUserId,
    customers,
    fromDate,
    toDate,
  ]);

  const exportXLSX = useCallback(async () => {
    if (rows.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;

    // Matches the on-screen sort: longest daysToClose first, open proposals
    // (null) sink to the bottom.
    const sorted = [...rows].sort((a, b) => {
      const aDays = a.daysToClose ?? Number.NEGATIVE_INFINITY;
      const bDays = b.daysToClose ?? Number.NEGATIVE_INFINITY;
      return bDays - aDays;
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Time to Close");

    const TITLE_BG = "FFD6E4F7";
    const HEADER_BG = "FFE2E8F0";
    const RED_BG = "FFFBD5D5";
    const GREEN_BG = "FFD5F5E3";
    const WHITE = "FFFFFFFF";
    const ALT_ROW_BG = "FFF0F4FA";

    sheet.columns = [
      { width: 32 }, // A Proposal
      { width: 26 }, // B Customer
      { width: 20 }, // C Status
      { width: 14 }, // D Date Sent
      { width: 14 }, // E Date Closed
      { width: 16 }, // F Days to Close
    ];

    sheet.mergeCells("A1:F1");
    const title = sheet.getCell("A1");
    title.value = "Rapid Rollout – Time to Close";
    title.font = { bold: true, size: 22 };
    title.alignment = { horizontal: "center", vertical: "middle" };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_BG } };
    sheet.getRow(1).height = 40;

    sheet.mergeCells("A2:F2");
    const filters = sheet.getCell("A2");
    const customerLabel =
      selectedCustomer === "all"
        ? "All Customers"
        : (customers.find((c) => c.id === selectedCustomer)?.company_name ??
          "All Customers");
    const rangeLabel =
      fromDate || toDate
        ? `${fromDate || "…"} → ${toDate || "…"}`
        : "All dates";
    filters.value = `Filtered by: ${customerLabel} · ${selectedStatus} · ${ownerFilter === "mine" ? "My proposals" : "All owners"} · Sent ${rangeLabel}`;
    filters.font = { italic: true, size: 11 };
    filters.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
    sheet.getRow(2).height = 20;

    sheet.getRow(3).height = 8;

    const headers = ["Proposal Name", "Customer", "Proposal Status", "Date Sent", "Date Closed", "Days to Close"];
    const hr = sheet.getRow(4);
    headers.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 12 };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    });
    hr.height = 22;

    const DATA_START = 5;
    sorted.forEach((r, idx) => {
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

      // A-C: text. D/E: real Date cells. F: integer.
      const textValues = [r.proposalName, r.customerName, r.status];
      textValues.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.font = { size: 12 };
        c.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
        c.fill = fill;
      });
      const dateValues: (Date | null)[] = [
        toDateOrNull(r.dateSent),
        toDateOrNull(r.dateClosed),
      ];
      dateValues.forEach((d, i) => {
        const c = row.getCell(4 + i);
        if (d) {
          c.value = d;
          c.numFmt = "dd mmm yy";
        } else {
          c.value = "—";
        }
        c.font = { size: 12 };
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.fill = fill;
      });
      const daysCell = row.getCell(6);
      daysCell.value = r.daysToClose ?? "";
      daysCell.font = { size: 12 };
      daysCell.alignment = { horizontal: "right", vertical: "middle" };
      daysCell.fill = fill;
      row.height = 18;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-to-close-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, selectedCustomer, selectedStatus, ownerFilter, fromDate, toDate, customers]);

  // Screen + XLSX share one sort: worst offenders (longest daysToClose) first.
  // Open proposals (null daysToClose) sink to the bottom so the top of the
  // table is always actionable.
  const sortedRows = [...rows].sort((a, b) => {
    const aDays = a.daysToClose ?? Number.NEGATIVE_INFINITY;
    const bDays = b.daysToClose ?? Number.NEGATIVE_INFINITY;
    return bDays - aDays;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Time to Close Report</h1>

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
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
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
            <div className="space-y-1">
              <Label className="text-xs">Sent From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sent To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 w-[160px]"
              />
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
              red rows closed in &gt;{CLOSE_THRESHOLD_DAYS} days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No proposals match these filters.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
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
                        <TableCell className="tabular-nums text-xs">
                          {formatDateShort(r.dateSent)}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {formatDateShort(r.dateClosed)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.daysToClose ?? "—"}
                        </TableCell>
                      </TableRow>
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
