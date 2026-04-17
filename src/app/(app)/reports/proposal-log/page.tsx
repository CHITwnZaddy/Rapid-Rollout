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
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/calculations/engine";
import type ExcelJS from "exceljs";
import {
  calculateMigrationTotals,
  type MigrationConfig as EngineMigrationConfig,
  type MigrationDetailLine,
} from "@/lib/calculations/migration-engine";

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
  opt1Cost: number;
  opt2Cost: number;
  scopedCost: number;
  migrationCost: number;
  grandTotal: number;
}

const STATUSES = [
  "All",
  "Draft",
  "Proposal Sent",
  "Customer Review",
  "Won",
  "Lost",
  "VOID",
];

export default function ProposalLogReport() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
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

    // Build proposal query
    let query = supabase
      .from("proposals")
      .select("id, name, status, customer_id")
      .order("created_at", { ascending: false });

    if (selectedCustomer !== "all") {
      query = query.eq("customer_id", selectedCustomer);
    }
    if (selectedStatus !== "All") {
      query = query.eq("status", selectedStatus);
    }

    const { data: proposals } = await query;
    if (!proposals || proposals.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const proposalIds = proposals.map((p) => p.id);

    // Fetch all related data in parallel.
    // migration_config fetches all fields needed by calculateMigrationTotals
    // so we can compute a live total instead of reading the stale snapshot.
    const [scenarioRes, scopedRes, migrationRes, migLinesRes, ratesRes] =
      await Promise.all([
        supabase
          .from("scenarios")
          .select("proposal_id, scenario_type, summary_total_cost")
          .in("proposal_id", proposalIds),
        supabase
          .from("scoped_services")
          .select("proposal_id, cost")
          .in("proposal_id", proposalIds),
        supabase
          .from("migration_config")
          .select("proposal_id, num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, ba_complexity_factor, pm_complexity_factor, ba_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs")
          .in("proposal_id", proposalIds),
        supabase
          .from("migration_detail_lines")
          .select(
            "proposal_id, section, label, quantity, items_per_object, total_line_items, row_order"
          )
          .in("proposal_id", proposalIds),
        supabase
          .from("rate_cards")
          .select("lookup_key, rate")
          .in("lookup_key", [
            "Master|Business Analyst",
            "Master|Program Manager",
            "Master|Travel Cost/Trip",
          ]),
      ]);

    // Build customer lookup
    const customerMap = new Map(customers.map((c) => [c.id, c.company_name]));

    // Build scenario cost map: proposalId -> { P1: cost, P2: cost, ... }
    const scenarioMap = new Map<string, Record<string, number>>();
    for (const s of scenarioRes.data ?? []) {
      if (!scenarioMap.has(s.proposal_id)) scenarioMap.set(s.proposal_id, {});
      scenarioMap.get(s.proposal_id)![s.scenario_type] = Number(s.summary_total_cost) || 0;
    }

    // Scoped cost map: proposalId -> total
    const scopedMap = new Map<string, number>();
    for (const s of scopedRes.data ?? []) {
      scopedMap.set(s.proposal_id, (scopedMap.get(s.proposal_id) ?? 0) + (Number(s.cost) || 0));
    }

    // Rate card lookup (shared across all proposals)
    const rateMap = new Map(
      (ratesRes.data ?? []).map((r) => [r.lookup_key, Number(r.rate) || 0])
    );
    const baRate = (rateMap.get("Master|Business Analyst") ?? 0);
    const pmRate = (rateMap.get("Master|Program Manager") ?? 0);
    const travelRate = (rateMap.get("Master|Travel Cost/Trip") ?? 0);

    // Group migration detail lines by proposal
    const migLinesMap = new Map<string, typeof migLinesRes.data>();
    for (const l of migLinesRes.data ?? []) {
      if (!migLinesMap.has(l.proposal_id)) migLinesMap.set(l.proposal_id, []);
      migLinesMap.get(l.proposal_id)!.push(l);
    }

    // Compute live migration total per proposal via calculateMigrationTotals.
    // Falls back to 0 if config is missing (no migration services configured).
    const migrationMap = new Map<string, number>();
    for (const cfg of migrationRes.data ?? []) {
      const allLines = migLinesMap.get(cfg.proposal_id) ?? [];
      const numP = Number(cfg.num_projects) || 0;

      const engineCfg: EngineMigrationConfig = {
        num_projects: numP,
        hrs_per_import: Number(cfg.hrs_per_import) || 0,
        lines_per_import_file: Number(cfg.lines_per_import_file) || 0,
        is_effort_included: cfg.is_effort_included,
        is_workshop_included: cfg.is_workshop_included,
        pm_contingency_pct: 0,
        ba_complexity_factor: Number(cfg.ba_complexity_factor) || 0,
        pm_complexity_factor: Number(cfg.pm_complexity_factor) || 0,
        ba_trips: Number(cfg.ba_trips) || 0,
        pm_trips: Number(cfg.pm_trips) || 0,
        doc_avg_mb_per_project: Number(cfg.doc_avg_mb_per_project) || 0,
        doc_mb_per_hour: Number(cfg.doc_mb_per_hour) || 0,
        core_requirements_hrs: Number(cfg.core_requirements_hrs) || 0,
        core_migration_plan_hrs: Number(cfg.core_migration_plan_hrs) || 0,
        core_validation_hrs: Number(cfg.core_validation_hrs) || 0,
        core_final_qa_hrs: Number(cfg.core_final_qa_hrs) || 0,
        core_pm_oversight_hrs: Number(cfg.core_pm_oversight_hrs) || 0,
      };

      const toLine = (
        l: { section: string; label: string; quantity: number; items_per_object: number; total_line_items: number; row_order: number },
        qtyOverride?: number
      ): MigrationDetailLine => ({
        id: "",
        section: l.section as "project" | "workflow" | "cost",
        label: l.label,
        quantity: qtyOverride ?? (Number(l.quantity) || 0),
        items_per_object: Number(l.items_per_object) || 0,
        total_line_items: Number(l.total_line_items) || 0,
        row_order: l.row_order,
      });

      const projectLines = allLines
        .filter((l) => l.section === "project")
        .map((l) => toLine(l, numP));
      const workflowLines = allLines
        .filter((l) => l.section === "workflow" && l.label && l.label !== "WF Object Name" && l.label.trim() !== "")
        .map((l) => toLine(l));
      const costLines = allLines
        .filter((l) => l.section === "cost" && l.label && l.label !== "TBD" && l.label.trim() !== "")
        .map((l) => toLine(l));

      const liveTotal = calculateMigrationTotals(
        engineCfg,
        projectLines,
        workflowLines,
        costLines,
        baRate,
        pmRate,
        travelRate
      ).salesPrice;

      migrationMap.set(cfg.proposal_id, liveTotal);
    }

    const reportRows: ReportRow[] = proposals.map((p) => {
      const sc = scenarioMap.get(p.id) ?? {};
      const p1 = sc["P1"] ?? 0;
      const p2 = sc["P2"] ?? 0;
      const opt1 = sc["Opt1"] ?? 0;
      const opt2 = sc["Opt2"] ?? 0;
      const scoped = scopedMap.get(p.id) ?? 0;
      const migration = migrationMap.get(p.id) ?? 0;

      return {
        proposalId: p.id,
        proposalName: p.name,
        customerName: customerMap.get(p.customer_id ?? "") ?? "—",
        status: p.status,
        p1Cost: p1,
        p2Cost: p2,
        opt1Cost: opt1,
        opt2Cost: opt2,
        scopedCost: scoped,
        migrationCost: migration,
        grandTotal: p1 + p2 + opt1 + opt2 + scoped + migration,
      };
    });

    setRows(reportRows);
    setLoading(false);
  }, [supabase, selectedCustomer, selectedStatus, customers]);

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
      selectedStatus === "All" ? "All Statuses" : selectedStatus;

    // ── Workbook / sheet ─────────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Proposal Log");

    const TOTAL_COLS = 10;
    const LAST_COL_LETTER = "J";
    const CURRENCY_FMT = '$#,##0.00';
    const TITLE_BG    = "FFD6E4F7"; // light blue
    const HEADER_BG   = "FFE2E8F0"; // light gray
    const ALT_ROW_BG  = "FFF0F4FA"; // very light blue-gray (alternating)
    const WHITE       = "FFFFFFFF";

    // ── Column widths ────────────────────────────────────────────────────────
    sheet.columns = [
      { width: 24 }, // A Customer
      { width: 32 }, // B Proposal Name
      { width: 20 }, // C Proposal Status
      { width: 15 }, // D Phase 1
      { width: 15 }, // E Phase 2
      { width: 15 }, // F Option 1
      { width: 15 }, // G Option 2
      { width: 20 }, // H Ad-hoc Services
      { width: 22 }, // I Migration Services
      { width: 18 }, // J Grand Total
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
      "Phase 1",
      "Phase 2",
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

      // Text columns: Customer, Proposal Name, Proposal Status
      const textValues = [r.customerName, r.proposalName, r.status];
      textValues.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.font = { size: 12 };
        cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
        cell.fill = fill;
      });

      // Numeric columns: Phase 1 … Grand Total
      const numValues = [
        r.p1Cost,
        r.p2Cost,
        r.opt1Cost,
        r.opt2Cost,
        r.scopedCost,
        r.migrationCost,
        r.grandTotal,
      ];
      numValues.forEach((v, i) => {
        const cell = row.getCell(4 + i);
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

    // Merge A–I for the "Grand Total" label
    sheet.mergeCells(
      `A${grandTotalRowNum}:I${grandTotalRowNum}`
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
  }, [rows, selectedCustomer, selectedStatus, customers]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Proposal Log Report</h1>

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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Proposal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">P1</TableHead>
                      <TableHead className="text-right">P2</TableHead>
                      <TableHead className="text-right">Opt1</TableHead>
                      <TableHead className="text-right">Opt2</TableHead>
                      <TableHead className="text-right">Scoped</TableHead>
                      <TableHead className="text-right">Migration</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.proposalId}>
                        <TableCell className="font-medium">
                          {r.customerName}
                        </TableCell>
                        <TableCell>{r.proposalName}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              r.status === "Won"
                                ? "default"
                                : r.status === "Lost" || r.status === "VOID"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.p1Cost > 0 ? formatCurrency(r.p1Cost) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.p2Cost > 0 ? formatCurrency(r.p2Cost) : "—"}
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
                      <TableCell colSpan={3}>Totals</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.p1Cost, 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(rows.reduce((s, r) => s + r.p2Cost, 0))}
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
