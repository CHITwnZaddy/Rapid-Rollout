"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
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
import { formatCurrency } from "@/lib/calculations/engine";
import {
  calculateMigrationTotals,
  type MigrationConfig as EngineMigrationConfig,
  type MigrationDetailLine,
} from "@/lib/calculations/migration-engine";
import { applyComplexity } from "@/lib/calculations/complexity";
import type ExcelJS from "exceljs";

type OwnerFilter = "all" | "mine";

type PortfolioRow = {
  proposalId: string;
  proposalName: string;
  customerName: string;
  status: string;
  scenarioTotal: number;
  scopedTotal: number;
  migrationTotal: number;
  grandTotal: number;
};

// Closed-lost and VOID proposals are excluded by default — "portfolio"
// should reflect realizable pipeline value, not sunk deals.
const DEFAULT_EXCLUDED_STATUSES = new Set(["Lost", "VOID"]);

export default function PortfolioValueReport() {
  const supabase = createClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Default to "mine" — the plan called this out as "My Portfolio Value".
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("mine");
  const [includeLost, setIncludeLost] = useState(false);
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, [supabase]);

  const runReport = useCallback(async () => {
    setLoading(true);
    setHasRun(true);

    let query = supabase
      .from("proposals")
      .select("id, name, status, customer_id, created_by, scoped_complexity_factor");

    if (ownerFilter === "mine" && currentUserId) {
      query = query.eq("created_by", currentUserId);
    }

    const { data: proposals } = await query;
    if (!proposals || proposals.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const filtered = includeLost
      ? proposals
      : proposals.filter((p) => !DEFAULT_EXCLUDED_STATUSES.has(p.status));

    if (filtered.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const proposalIds = filtered.map((p) => p.id);
    const [customerRes, scenarioRes, scopedRes, migrationRes, migLinesRes, ratesRes] =
      await Promise.all([
        supabase.from("customers").select("id, company_name"),
        supabase
          .from("scenarios")
          .select("proposal_id, summary_total_cost, complexity_factor")
          .in("proposal_id", proposalIds),
        supabase
          .from("scoped_services")
          .select("proposal_id, cost")
          .in("proposal_id", proposalIds),
        supabase
          .from("migration_config")
          .select(
            "proposal_id, num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, ba_complexity_factor, pm_complexity_factor, ba_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs"
          )
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

    const customerMap = new Map(
      (customerRes.data ?? []).map((c) => [c.id, c.company_name])
    );

    const scenarioTotalByProposal = new Map<string, number>();
    for (const s of scenarioRes.data ?? []) {
      const multiplied = applyComplexity(
        Number(s.summary_total_cost) || 0,
        Number(s.complexity_factor ?? 1)
      );
      scenarioTotalByProposal.set(
        s.proposal_id,
        (scenarioTotalByProposal.get(s.proposal_id) ?? 0) + multiplied
      );
    }

    const scopedRawByProposal = new Map<string, number>();
    for (const s of scopedRes.data ?? []) {
      scopedRawByProposal.set(
        s.proposal_id,
        (scopedRawByProposal.get(s.proposal_id) ?? 0) + (Number(s.cost) || 0)
      );
    }

    const rateMap = new Map(
      (ratesRes.data ?? []).map((r) => [r.lookup_key, Number(r.rate) || 0])
    );
    const baRate = rateMap.get("Master|Business Analyst") ?? 0;
    const pmRate = rateMap.get("Master|Program Manager") ?? 0;
    const travelRate = rateMap.get("Master|Travel Cost/Trip") ?? 0;

    const migLinesMap = new Map<string, typeof migLinesRes.data>();
    for (const l of migLinesRes.data ?? []) {
      if (!migLinesMap.has(l.proposal_id)) migLinesMap.set(l.proposal_id, []);
      migLinesMap.get(l.proposal_id)!.push(l);
    }

    const migrationTotalByProposal = new Map<string, number>();
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
        l: {
          section: string;
          label: string;
          quantity: number;
          items_per_object: number;
          total_line_items: number;
          row_order: number;
        },
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
        .filter(
          (l) =>
            l.section === "workflow" &&
            l.label &&
            l.label !== "WF Object Name" &&
            l.label.trim() !== ""
        )
        .map((l) => toLine(l));
      const costLines = allLines
        .filter(
          (l) =>
            l.section === "cost" &&
            l.label &&
            l.label !== "TBD" &&
            l.label.trim() !== ""
        )
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
      migrationTotalByProposal.set(cfg.proposal_id, liveTotal);
    }

    const portfolio: PortfolioRow[] = filtered
      .map((p) => {
        const scopedFactor = Number(p.scoped_complexity_factor) || 1;
        const scenarioTotal = scenarioTotalByProposal.get(p.id) ?? 0;
        const scopedTotal = applyComplexity(
          scopedRawByProposal.get(p.id) ?? 0,
          scopedFactor
        );
        const migrationTotal = migrationTotalByProposal.get(p.id) ?? 0;
        return {
          proposalId: p.id,
          proposalName: p.name,
          customerName: customerMap.get(p.customer_id ?? "") ?? "—",
          status: p.status,
          scenarioTotal,
          scopedTotal,
          migrationTotal,
          grandTotal: scenarioTotal + scopedTotal + migrationTotal,
        };
      })
      // Sort by status, then by grand total desc — bigger deals bubble up within each status.
      .sort((a, b) => {
        const s = a.status.localeCompare(b.status);
        return s !== 0 ? s : b.grandTotal - a.grandTotal;
      });

    setRows(portfolio);
    setLoading(false);
  }, [supabase, ownerFilter, includeLost, currentUserId]);

  // Group by status for the render; keep the original row order (already sorted).
  const grouped = rows.reduce<Map<string, PortfolioRow[]>>((map, r) => {
    if (!map.has(r.status)) map.set(r.status, []);
    map.get(r.status)!.push(r);
    return map;
  }, new Map());

  const statusTotals = (group: PortfolioRow[]) =>
    group.reduce((s, r) => s + r.grandTotal, 0);
  const overallTotal = rows.reduce((s, r) => s + r.grandTotal, 0);

  const exportXLSX = useCallback(async () => {
    if (rows.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Portfolio Value");

    const TITLE_BG = "FFD6E4F7";
    const HEADER_BG = "FFE2E8F0";
    const GROUP_BG = "FFEAF1FB";
    const WHITE = "FFFFFFFF";
    const ALT_ROW_BG = "FFF0F4FA";
    const CURRENCY_FMT = "$#,##0.00";

    sheet.columns = [
      { width: 32 }, // A Proposal
      { width: 26 }, // B Customer
      { width: 18 }, // C Status
      { width: 18 }, // D Scenario Total
      { width: 16 }, // E Scoped Total
      { width: 18 }, // F Migration Total
      { width: 18 }, // G Grand Total
    ];

    sheet.mergeCells("A1:G1");
    const title = sheet.getCell("A1");
    title.value = "Rapid Rollout – Portfolio Value";
    title.font = { bold: true, size: 22 };
    title.alignment = { horizontal: "center", vertical: "middle" };
    title.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: TITLE_BG },
    };
    sheet.getRow(1).height = 40;

    sheet.mergeCells("A2:G2");
    const filters = sheet.getCell("A2");
    filters.value = `Filtered by: ${ownerFilter === "mine" ? "My proposals" : "All owners"} · ${includeLost ? "Including Lost/VOID" : "Excluding Lost/VOID"}`;
    filters.font = { italic: true, size: 11 };
    filters.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
    sheet.getRow(2).height = 20;
    sheet.getRow(3).height = 8;

    const headers = [
      "Proposal",
      "Customer",
      "Status",
      "Scenario Total",
      "Scoped Total",
      "Migration Total",
      "Grand Total",
    ];
    const hr = sheet.getRow(4);
    headers.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 12 };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    });
    hr.height = 22;

    let cursor = 5;
    for (const [status, group] of grouped) {
      // Group header row
      const groupRow = sheet.getRow(cursor);
      sheet.mergeCells(`A${cursor}:C${cursor}`);
      const labelCell = groupRow.getCell(1);
      labelCell.value = status;
      labelCell.font = { bold: true, size: 12 };
      labelCell.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_BG } };

      const sums = {
        scenario: group.reduce((s, r) => s + r.scenarioTotal, 0),
        scoped: group.reduce((s, r) => s + r.scopedTotal, 0),
        migration: group.reduce((s, r) => s + r.migrationTotal, 0),
        grand: statusTotals(group),
      };
      [sums.scenario, sums.scoped, sums.migration, sums.grand].forEach((v, i) => {
        const c = groupRow.getCell(4 + i);
        c.value = v;
        c.numFmt = CURRENCY_FMT;
        c.font = { bold: true, size: 12 };
        c.alignment = { horizontal: "right", vertical: "middle" };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_BG } };
      });
      groupRow.height = 20;
      cursor += 1;

      group.forEach((r, idx) => {
        const row = sheet.getRow(cursor);
        const fill: ExcelJS.Fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: idx % 2 === 0 ? ALT_ROW_BG : WHITE },
        };
        const textVals = [r.proposalName, r.customerName, r.status];
        textVals.forEach((v, i) => {
          const c = row.getCell(i + 1);
          c.value = v;
          c.font = { size: 12 };
          c.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
          c.fill = fill;
        });
        const numVals = [r.scenarioTotal, r.scopedTotal, r.migrationTotal, r.grandTotal];
        numVals.forEach((v, i) => {
          const c = row.getCell(4 + i);
          c.value = v;
          c.numFmt = CURRENCY_FMT;
          c.font = { size: 12 };
          c.alignment = { horizontal: "right", vertical: "middle" };
          c.fill = fill;
        });
        row.height = 18;
        cursor += 1;
      });
    }

    // Grand total row
    const gtRow = sheet.getRow(cursor);
    sheet.mergeCells(`A${cursor}:F${cursor}`);
    const gtLabel = gtRow.getCell(1);
    gtLabel.value = "Portfolio Total";
    gtLabel.font = { bold: true, size: 12 };
    gtLabel.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    gtLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    const gtValue = gtRow.getCell(7);
    gtValue.value = overallTotal;
    gtValue.numFmt = CURRENCY_FMT;
    gtValue.font = { bold: true, size: 12 };
    gtValue.alignment = { horizontal: "right", vertical: "middle" };
    gtValue.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    gtRow.height = 22;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-value-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, grouped, overallTotal, ownerFilter, includeLost]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Portfolio Value Report</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Owner</Label>
              <Select
                value={ownerFilter}
                onValueChange={(v) =>
                  setOwnerFilter((v ?? "mine") as OwnerFilter)
                }
              >
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mine">My Proposals</SelectItem>
                  <SelectItem value="all">All Owners</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm pb-1.5">
              <input
                type="checkbox"
                checked={includeLost}
                onChange={(e) => setIncludeLost(e.target.checked)}
                className="h-4 w-4"
              />
              Include Lost / VOID
            </label>
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
              Portfolio Total {formatCurrency(overallTotal)}
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
                      <TableHead className="text-right">Scenario Total</TableHead>
                      <TableHead className="text-right">Scoped Total</TableHead>
                      <TableHead className="text-right">Migration Total</TableHead>
                      <TableHead className="text-right">Grand Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from(grouped.entries()).map(([status, group]) => (
                      <Fragment key={`group-${status}`}>
                        <TableRow className="bg-muted/40">
                          <TableCell colSpan={3} className="font-semibold">
                            {status}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrency(
                              group.reduce((s, r) => s + r.scenarioTotal, 0)
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrency(
                              group.reduce((s, r) => s + r.scopedTotal, 0)
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrency(
                              group.reduce((s, r) => s + r.migrationTotal, 0)
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrency(statusTotals(group))}
                          </TableCell>
                        </TableRow>
                        {group.map((r) => (
                          <TableRow key={r.proposalId}>
                            <TableCell className="font-medium">
                              {r.proposalName}
                            </TableCell>
                            <TableCell>{r.customerName}</TableCell>
                            <TableCell>{r.status}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(r.scenarioTotal)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(r.scopedTotal)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(r.migrationTotal)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(r.grandTotal)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                    <TableRow className="bg-muted/60 font-semibold">
                      <TableCell colSpan={6} className="text-right">
                        Portfolio Total
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(overallTotal)}
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
