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
import { applyComplexity } from "@/lib/calculations/complexity";
import { PROPOSAL_STATUSES } from "@/lib/constants/statuses";
import type ExcelJS from "exceljs";
import {
  buildMigrationCostMap,
  buildRateMap,
  buildScenarioTotalByProposal,
  buildScopedCostMap,
} from "@/lib/reports/proposal-aggregates";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";
import { toast } from "sonner";

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
    try {
      let query = supabase
        .from("proposals")
        .select("id, name, status, customer_id, created_by, scoped_complexity_factor");

      if (ownerFilter === "mine" && currentUserId) {
        query = query.eq("created_by", currentUserId);
      }

      const { data: proposals } = await query;
      if (!proposals || proposals.length === 0) {
        setRows([]);
        return;
      }

      const filtered = includeLost
        ? proposals
        : proposals.filter((p) => !DEFAULT_EXCLUDED_STATUSES.has(p.status));

      if (filtered.length === 0) {
        setRows([]);
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
              "proposal_id, num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, sr_im_complexity_factor, pm_complexity_factor, sr_im_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs"
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
            .in("lookup_key", [SR_IM_RATE_KEY, PM_RATE_KEY, TRAVEL_RATE_KEY, INTERNAL_COST_RATE_KEY]),
        ]);

      const customerMap = new Map(
        (customerRes.data ?? []).map((c) => [c.id, c.company_name])
      );
      const scenarioTotalByProposal = buildScenarioTotalByProposal(
        scenarioRes.data ?? []
      );
      const scopedRawByProposal = buildScopedCostMap(scopedRes.data ?? []);
      const rateMap = buildRateMap(ratesRes.data ?? []);
      const migrationTotalByProposal = buildMigrationCostMap(
        migrationRes.data ?? [],
        migLinesRes.data ?? [],
        rateMap
      );

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
      // Group order follows PROPOSAL_STATUSES (Draft → Proposal Sent → … → VOID).
      // Within each group, sort by Proposal Name A→Z. Unknown statuses sink to
      // the bottom via a large sentinel index.
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

      setRows(portfolio);
    } catch (error) {
      setRows([]);
      toast.error(
        error instanceof Error
          ? error.message
          : "Portfolio Value report failed to load."
      );
    } finally {
      setLoading(false);
    }
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

    const TITLE_BG = "FFC1C1DE";
    const HEADER_BG = "FFD5D6E9";
    const GROUP_BG = "FFD5D6E9";
    const WHITE = "FFFFFFFF";
    const ALT_ROW_BG = "FFEAEAF4";
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
      "Proposal Name",
      "Customer",
      "Proposal Status",
      "Scenario Total",
      "Scoped Services Total",
      "Migration Services Total",
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
                  <SelectValue>
                    {ownerFilter === "mine" ? "My Proposals" : "All Owners"}
                  </SelectValue>
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
                      <TableHead>Proposal Name</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Proposal Status</TableHead>
                      <TableHead className="text-right">Scenario Total</TableHead>
                      <TableHead className="text-right">Scoped Services Total</TableHead>
                      <TableHead className="text-right">Migration Services Total</TableHead>
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
