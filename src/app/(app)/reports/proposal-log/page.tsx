"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/calculations/engine";
import type ExcelJS from "exceljs";
import { formatDateShort, toDateOrNull } from "@/lib/reports/format";
import { buildMigrationCostMap } from "@/lib/reports/proposal-aggregates";
import {
  fetchMigrationCostInputs,
  fetchRevenueReportBaseRows,
  fetchStatusHistoryMap,
} from "@/lib/reports/data";
import { toast } from "sonner";
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_VARIANT,
  type ProposalStatus,
} from "@/lib/constants/statuses";
import { OPEN_PROPOSAL_STATUSES } from "@/lib/proposals/status";

interface Customer {
  id: string;
  company_name: string;
}

interface ReportRow {
  proposalId: string;
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
  // PR 3b: new columns sourced from proposal_status_history + proposals
  dateCreated: string | null;
  dateProposalSent: string | null;
  dateWon: string | null;
  daysInCurrentStatus: number | null;
  scopedComplexityFactor: number;
}

const STATUSES = [
  "All",
  ...PROPOSAL_STATUSES,
];

type OwnerScope = "team" | "mine" | "specific";

function parseStatusPreset(value: string | null): string[] | undefined {
  if (!value || value === "All") return undefined;
  if (value === "open") return [...OPEN_PROPOSAL_STATUSES];
  return value.split(",").map((status) => status.trim()).filter(Boolean);
}

export default function ProposalLogReport() {
  const supabase = createClient();
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState(
    statusPreset?.length === 1 ? statusPreset[0] : "All"
  );
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
    try {
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
      if (proposals.length === 0) {
        setRows([]);
        return;
      }

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

      const reportRows: ReportRow[] = proposals.map((p) => {
        const scopedFactor = Number(p.scoped_complexity_factor) || 1;
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
          proposalId: p.proposal_id,
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
          scopedComplexityFactor: scopedFactor,
        };
      });

      setRows(reportRows);
    } catch (error) {
      setRows([]);
      toast.error(
        error instanceof Error
          ? error.message
          : "Proposal Log report failed to load."
      );
    } finally {
      setLoading(false);
    }
  }, [
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
    if (rows.length === 0) return;

    // Dynamic import keeps exceljs out of the initial JS bundle.
    const ExcelJS = (await import("exceljs")).default;

    // ── Sort: Status A→Z, then Customer A→Z within each status ──────────────
    const sorted = [...rows].sort((a, b) => {
      const sd = a.status.localeCompare(b.status);
      return sd !== 0 ? sd : a.customerName.localeCompare(b.customerName);
    });

    // ── Filter label ─────────────────────────────────────────────────────────
    const customerLabel =
      selectedCustomer === "all"
        ? "All Customers"
        : (customers.find((c) => c.id === selectedCustomer)?.company_name ??
          "All Customers");
    const statusLabel =
      statusPreset && statusPreset.length > 1
        ? statusPreset.join(", ")
        : selectedStatus === "All" ? "All Statuses" : selectedStatus;

    // ── Workbook / sheet ─────────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Proposal Log");

    const TOTAL_COLS = 17;
    const LAST_COL_LETTER = "Q";
    const CURRENCY_FMT = '$#,##0.00';
    const TITLE_BG    = "FFC1C1DE"; // #313392 tint — title row
    const HEADER_BG   = "FFD5D6E9"; // #313392 tint — column headers + section totals
    const ALT_ROW_BG  = "FFEAEAF4"; // #313392 tint — alternating data rows
    const WHITE       = "FFFFFFFF";

    // ── Column widths ────────────────────────────────────────────────────────
    sheet.columns = [
      { width: 24 }, // A Customer
      { width: 32 }, // B Proposal Name
      { width: 20 }, // C Proposal Status
      { width: 13 }, // D Date Created
      { width: 13 }, // E Date Proposal Sent
      { width: 13 }, // F Date Won
      { width: 15 }, // G Days in Current Status
      { width: 12 }, // H Scoped CF
      { width: 15 }, // I Phase 1
      { width: 15 }, // J Phase 2
      { width: 15 }, // K Phase 3
      { width: 15 }, // L Phase 4
      { width: 15 }, // M Option 1
      { width: 15 }, // N Option 2
      { width: 20 }, // O Ad-hoc Services
      { width: 22 }, // P Migration Services
      { width: 18 }, // Q Grand Total
    ];

    // ── Row 1: Title ─────────────────────────────────────────────────────────
    sheet.mergeCells(`A1:${LAST_COL_LETTER}1`);
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Rapid Rollout – Proposal Log";
    titleCell.font = { bold: true, size: 24 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: TITLE_BG },
    };
    sheet.getRow(1).height = 44;

    // ── Row 2: Filter label ──────────────────────────────────────────────────
    sheet.mergeCells(`A2:${LAST_COL_LETTER}2`);
    const filterCell = sheet.getCell("A2");
    filterCell.value = `Filtered by: ${customerLabel} and ${statusLabel}`;
    filterCell.font = { size: 11, italic: true };
    filterCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    sheet.getRow(2).height = 20;

    // ── Row 3: Spacer ────────────────────────────────────────────────────────
    sheet.getRow(3).height = 8;

    // ── Row 4: Column headers ────────────────────────────────────────────────
    const HEADER_NAMES = [
      "Customer",
      "Proposal Name",
      "Proposal Status",
      "Date Created",
      "Date Proposal Sent",
      "Date Won",
      "Days in Current Status",
      "Complexity Factor",
      "Phase 1",
      "Phase 2",
      "Phase 3",
      "Phase 4",
      "Option 1",
      "Option 2",
      "Ad-hoc Services",
      "Migration Services",
      "Grand Total",
    ];
    const headerRow = sheet.getRow(4);
    HEADER_NAMES.forEach((name, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = name;
      cell.font = { bold: true, size: 12 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: HEADER_BG },
      };
    });
    headerRow.height = 22;

    // ── Data rows (starting at row 5) ────────────────────────────────────────
    const DATA_START = 5;
    sorted.forEach((r, idx) => {
      const rowNum = DATA_START + idx;
      const row = sheet.getRow(rowNum);
      const bgArgb = idx % 2 === 0 ? ALT_ROW_BG : WHITE;
      const fill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bgArgb },
      };

      // Text columns A-C: Customer, Proposal Name, Status
      const textValues = [r.customerName, r.proposalName, r.status];
      textValues.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.font = { size: 12 };
        cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
        cell.fill = fill;
      });

      // Date columns D-F: real Date cells with "dd mmm yy" format so
      // Excel sort/filter still works. Nulls write as "—" text cells.
      const dateValues: (Date | null)[] = [
        toDateOrNull(r.dateCreated),
        toDateOrNull(r.dateProposalSent),
        toDateOrNull(r.dateWon),
      ];
      dateValues.forEach((d, i) => {
        const cell = row.getCell(4 + i);
        if (d) {
          cell.value = d;
          cell.numFmt = "dd mmm yy";
        } else {
          cell.value = "—";
        }
        cell.font = { size: 12 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill = fill;
      });

      // Integer column G: Days in Current Status
      const daysCell = row.getCell(7);
      daysCell.value = r.daysInCurrentStatus ?? "";
      daysCell.font = { size: 12 };
      daysCell.alignment = { horizontal: "right", vertical: "middle" };
      daysCell.fill = fill;

      // Factor column H: Scoped CF
      const cfCell = row.getCell(8);
      cfCell.value = r.scopedComplexityFactor;
      cfCell.numFmt = "0.00";
      cfCell.font = { size: 12 };
      cfCell.alignment = { horizontal: "right", vertical: "middle" };
      cfCell.fill = fill;

      // Currency columns I-O: Phase 1 … Grand Total
      const numValues = [
        r.p1Cost,
        r.p2Cost,
        r.p3Cost,
        r.p4Cost,
        r.opt1Cost,
        r.opt2Cost,
        r.scopedCost,
        r.migrationCost,
        r.grandTotal,
      ];
      numValues.forEach((v, i) => {
        const cell = row.getCell(9 + i);
        cell.value = v;
        cell.numFmt = CURRENCY_FMT;
        cell.font = { size: 12 };
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.fill = fill;
      });

      row.height = 18;
    });

    // ── Grand Total row ──────────────────────────────────────────────────────
    const grandTotalRowNum = DATA_START + sorted.length;
    const grandTotalRow = sheet.getRow(grandTotalRowNum);
    const grandTotalValue = sorted.reduce((sum, r) => sum + r.grandTotal, 0);
    const gtFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_BG },
    };

    // Merge A-P for the "Grand Total" label (col Q holds the value)
    sheet.mergeCells(
      `A${grandTotalRowNum}:P${grandTotalRowNum}`
    );
    const gtLabelCell = grandTotalRow.getCell(1);
    gtLabelCell.value = "Grand Total";
    gtLabelCell.font = { bold: true, size: 12 };
    gtLabelCell.alignment = {
      horizontal: "right",
      vertical: "middle",
      indent: 1,
    };
    gtLabelCell.fill = gtFill;

    const gtValueCell = grandTotalRow.getCell(TOTAL_COLS);
    gtValueCell.value = grandTotalValue;
    gtValueCell.numFmt = CURRENCY_FMT;
    gtValueCell.font = { bold: true, size: 12 };
    gtValueCell.alignment = { horizontal: "right", vertical: "middle" };
    gtValueCell.fill = gtFill;
    grandTotalRow.height = 22;

    // ── Write buffer → trigger browser download ──────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `proposal-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [rows, selectedCustomer, selectedStatus, statusPreset, customers]);

  // Screen sort: Customer A→Z. XLSX intentionally keeps its own Status→Customer
  // sort (see exportXLSX) — managers want status-grouped output in the file.
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Proposal Log Report</h1>
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

      {/* Filters */}
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
                      : customers.find((c) => c.id === selectedCustomer)
                          ?.company_name ?? "All Customers"}
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

      {/* Results */}
      {hasRun && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Results ({rows.length} proposal{rows.length !== 1 ? "s" : ""})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No proposals found matching your filters.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table className="min-w-[1120px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Proposal Name</TableHead>
                      <TableHead>Proposal Status</TableHead>
                      <TableHead>Created On</TableHead>
                      <TableHead>Sent On</TableHead>
                      <TableHead>Won On</TableHead>
                      <TableHead className="text-right">Days in Status</TableHead>
                      <TableHead className="text-right">Complexity Factor</TableHead>
                      <TableHead className="text-right">Phase 1</TableHead>
                      <TableHead className="text-right">Phase 2</TableHead>
                      <TableHead className="text-right">Phase 3</TableHead>
                      <TableHead className="text-right">Phase 4</TableHead>
                      <TableHead className="text-right">Option 1</TableHead>
                      <TableHead className="text-right">Option 2</TableHead>
                      <TableHead className="text-right">Scoped Services</TableHead>
                      <TableHead className="text-right">Migration Services</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {screenRows.map((r) => (
                      <TableRow key={r.proposalId} className="hover:bg-muted/50">
                        <TableCell className="font-medium">
                          {r.customerName}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/proposals/${r.proposalId}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {r.proposalName}
                          </Link>
                        </TableCell>
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
                          {formatDateShort(r.dateCreated)}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {formatDateShort(r.dateProposalSent)}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {formatDateShort(r.dateWon)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.daysInCurrentStatus ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.scopedComplexityFactor.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.p1Cost > 0 ? formatCurrency(r.p1Cost) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.p2Cost > 0 ? formatCurrency(r.p2Cost) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.p3Cost > 0 ? formatCurrency(r.p3Cost) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.p4Cost > 0 ? formatCurrency(r.p4Cost) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.opt1Cost > 0 ? formatCurrency(r.opt1Cost) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.opt2Cost > 0 ? formatCurrency(r.opt2Cost) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.scopedCost > 0 ? formatCurrency(r.scopedCost) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.migrationCost > 0
                            ? formatCurrency(r.migrationCost)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(r.grandTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={8}>Totals</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.p1Cost, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.p2Cost, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.p3Cost, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.p4Cost, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.opt1Cost, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.opt2Cost, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.scopedCost, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.migrationCost, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.grandTotal, 0))}
                      </TableCell>
                    </TableRow>
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
