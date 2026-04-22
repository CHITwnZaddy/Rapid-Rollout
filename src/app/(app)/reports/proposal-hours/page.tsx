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
import type ExcelJS from "exceljs";
import {
  buildMigrationHoursMap,
  buildRateMap,
  buildScopedHoursMap,
} from "@/lib/reports/proposal-aggregates";
import {
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";

type Customer = { id: string; company_name: string };
type OwnerFilter = "all" | "mine";

// A single (proposal, scenario-or-bucket) row. "scenario" is one of
// P1/P2/Opt1/Opt2/"Scoped Services"/"Migration Services" — the latter two
// are synthetic rows aggregated across their underlying tables.
type HoursRow = {
  proposalId: string;
  proposalName: string;
  customerName: string;
  scenario: string;
  srImHours: number;
  pmHours: number;
  baHours: number;
  totalHours: number;
};

const SCENARIO_FILTER = [
  "All",
  "P1",
  "P2",
  "Opt1",
  "Opt2",
  "Scoped Services",
  "Migration Services",
];

export default function ProposalHoursReport() {
  const supabase = createClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("all");
  const [selectedScenario, setSelectedScenario] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [rows, setRows] = useState<HoursRow[]>([]);
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
      .select("id, name, status, customer_id, created_by");

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

    // scenarios must come first so we can scope scenario_lines to just
    // the scenarios we care about (scenario_lines has no proposal_id FK).
    const { data: scenarios } = await supabase
      .from("scenarios")
      .select("id, proposal_id, scenario_type")
      .in("proposal_id", proposalIds);
    const scenarioIds = (scenarios ?? []).map((s) => s.id);

    const [scenarioLineRes, scopedRes, migrationRes, migLinesRes, ratesRes] =
      await Promise.all([
      scenarioIds.length
        ? supabase
            .from("scenario_lines")
            .select("scenario_id, sr_im_hours, pm_hours, ba_hours")
            .in("scenario_id", scenarioIds)
        : Promise.resolve({ data: [] as { scenario_id: string; sr_im_hours: number; pm_hours: number; ba_hours: number }[] }),
      supabase
        .from("scoped_services")
        .select("proposal_id, hours, rate_card_lookup_key")
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
        .in("lookup_key", [SR_IM_RATE_KEY, PM_RATE_KEY, TRAVEL_RATE_KEY]),
    ]);

    const customerMap = new Map(customers.map((c) => [c.id, c.company_name]));

    // Scenario aggregation — sum hours from scenario_lines per scenario_id,
    // then attach back to the scenario row by id.
    const lineSumByScenario = new Map<
      string,
      { sr: number; pm: number; ba: number }
    >();
    for (const l of scenarioLineRes.data ?? []) {
      const agg = lineSumByScenario.get(l.scenario_id) ?? { sr: 0, pm: 0, ba: 0 };
      agg.sr += Number(l.sr_im_hours) || 0;
      agg.pm += Number(l.pm_hours) || 0;
      agg.ba += Number(l.ba_hours) || 0;
      lineSumByScenario.set(l.scenario_id, agg);
    }

    // Scoped Services — bucket hours by role via rate_card_lookup_key.
    // Anything that isn't Sr IM / PM / BA is dropped (e.g. Travel Cost).
    const scopedByProposal = buildScopedHoursMap(scopedRes.data ?? []);

    // Migration — run the live engine; migration hours roll into the
    // Sr. IM bucket plus PM II oversight. BA should stay at 0.
    const rateMap = buildRateMap(ratesRes.data ?? []);
    const migrationByProposal = buildMigrationHoursMap(
      migrationRes.data ?? [],
      migLinesRes.data ?? [],
      rateMap
    );

    // Build one row per scenario + synthetic "Scoped" + "Migration" rows.
    const out: HoursRow[] = [];
    const customerName = (cid: string | null) =>
      customerMap.get(cid ?? "") ?? "—";

    // Keep a per-proposal index of actual scenarios so we can order consistently.
    const scenariosByProposal = new Map<
      string,
      { id: string; type: string }[]
    >();
    for (const s of scenarios ?? []) {
      if (!scenariosByProposal.has(s.proposal_id))
        scenariosByProposal.set(s.proposal_id, []);
      scenariosByProposal
        .get(s.proposal_id)!
        .push({ id: s.id, type: s.scenario_type });
    }

    const order = ["P1", "P2", "Opt1", "Opt2"];

    // Proposal Name A→Z — scenarios inside a proposal keep their own P1/P2/Opt1/Opt2
    // ordering, then Scoped + Migration are appended. XLSX export reads from the
    // same `rows` state so the two surfaces stay in sync.
    const sortedProposals = [...proposals].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const p of sortedProposals) {
      const cname = customerName(p.customer_id);
      const pScenarios = (scenariosByProposal.get(p.id) ?? []).sort(
        (a, b) => order.indexOf(a.type) - order.indexOf(b.type)
      );
      for (const s of pScenarios) {
        const sums = lineSumByScenario.get(s.id) ?? { sr: 0, pm: 0, ba: 0 };
        out.push({
          proposalId: p.id,
          proposalName: p.name,
          customerName: cname,
          scenario: s.type,
          srImHours: sums.sr,
          pmHours: sums.pm,
          baHours: sums.ba,
          totalHours: sums.sr + sums.pm + sums.ba,
        });
      }
      const sc = scopedByProposal.get(p.id);
      if (sc && (sc.sr || sc.pm || sc.ba)) {
        out.push({
          proposalId: p.id,
          proposalName: p.name,
          customerName: cname,
          scenario: "Scoped Services",
          srImHours: sc.sr,
          pmHours: sc.pm,
          baHours: sc.ba,
          totalHours: sc.sr + sc.pm + sc.ba,
        });
      }
      const mig = migrationByProposal.get(p.id);
      if (mig && (mig.pm || mig.srIm)) {
        out.push({
          proposalId: p.id,
          proposalName: p.name,
          customerName: cname,
          scenario: "Migration Services",
          srImHours: mig.srIm,
          pmHours: mig.pm,
          baHours: 0,
          totalHours: mig.pm + mig.srIm,
        });
      }
    }

    const filtered =
      selectedScenario === "All"
        ? out
        : out.filter((r) => r.scenario === selectedScenario);

    setRows(filtered);
    setLoading(false);
  }, [
    supabase,
    selectedCustomer,
    selectedScenario,
    ownerFilter,
    currentUserId,
    customers,
  ]);

  const exportXLSX = useCallback(async () => {
    if (rows.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Proposal Hours");
    const TITLE_BG = "FFC1C1DE";
    const HEADER_BG = "FFD5D6E9";
    const WHITE = "FFFFFFFF";
    const ALT_ROW_BG = "FFEAEAF4";
    const NUM_FMT = "#,##0.00";

    sheet.columns = [
      { width: 32 }, // A Proposal
      { width: 26 }, // B Customer
      { width: 20 }, // C Scenario
      { width: 14 }, // D Sr IM Hours
      { width: 14 }, // E PM Hours
      { width: 14 }, // F BA Hours
      { width: 14 }, // G Total Hours
    ];

    sheet.mergeCells("A1:G1");
    const title = sheet.getCell("A1");
    title.value = "Rapid Rollout – Proposal Hours";
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
    const customerLabel =
      selectedCustomer === "all"
        ? "All Customers"
        : (customers.find((c) => c.id === selectedCustomer)?.company_name ??
          "All Customers");
    filters.value = `Filtered by: ${customerLabel} · ${selectedScenario} · ${ownerFilter === "mine" ? "My proposals" : "All owners"}`;
    filters.font = { italic: true, size: 11 };
    filters.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
    sheet.getRow(2).height = 20;
    sheet.getRow(3).height = 8;

    const headers = [
      "Proposal Name",
      "Customer",
      "Scenario",
      "Sr IM Hours",
      "PM Hours",
      "BA Hours",
      "Total Hours",
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

    const DATA_START = 5;
    rows.forEach((r, idx) => {
      const row = sheet.getRow(DATA_START + idx);
      const fill: ExcelJS.Fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: idx % 2 === 0 ? ALT_ROW_BG : WHITE },
      };
      const textVals = [r.proposalName, r.customerName, r.scenario];
      textVals.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v;
        c.font = { size: 12 };
        c.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
        c.fill = fill;
      });
      const numVals = [r.srImHours, r.pmHours, r.baHours, r.totalHours];
      numVals.forEach((v, i) => {
        const c = row.getCell(4 + i);
        c.value = v;
        c.numFmt = NUM_FMT;
        c.font = { size: 12 };
        c.alignment = { horizontal: "right", vertical: "middle" };
        c.fill = fill;
      });
      row.height = 18;
    });

    // Grand total row
    const gtRow = sheet.getRow(DATA_START + rows.length);
    sheet.mergeCells(`A${DATA_START + rows.length}:C${DATA_START + rows.length}`);
    const gtLabel = gtRow.getCell(1);
    gtLabel.value = "Total";
    gtLabel.font = { bold: true, size: 12 };
    gtLabel.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
    gtLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    const totals = rows.reduce(
      (t, r) => {
        t.sr += r.srImHours;
        t.pm += r.pmHours;
        t.ba += r.baHours;
        t.total += r.totalHours;
        return t;
      },
      { sr: 0, pm: 0, ba: 0, total: 0 }
    );
    [totals.sr, totals.pm, totals.ba, totals.total].forEach((v, i) => {
      const c = gtRow.getCell(4 + i);
      c.value = v;
      c.numFmt = NUM_FMT;
      c.font = { bold: true, size: 12 };
      c.alignment = { horizontal: "right", vertical: "middle" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    });
    gtRow.height = 22;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposal-hours-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, selectedCustomer, selectedScenario, ownerFilter, customers]);

  const totals = rows.reduce(
    (t, r) => {
      t.sr += r.srImHours;
      t.pm += r.pmHours;
      t.ba += r.baHours;
      t.total += r.totalHours;
      return t;
    },
    { sr: 0, pm: 0, ba: 0, total: 0 }
  );
  const fmt = (n: number) => n.toFixed(2);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Proposal Hours Report</h1>

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
              <Label className="text-xs">Scenario</Label>
              <Select
                value={selectedScenario}
                onValueChange={(v) => setSelectedScenario(v ?? "All")}
              >
                <SelectTrigger className="h-8 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCENARIO_FILTER.map((s) => (
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
              Results ({rows.length} row{rows.length !== 1 ? "s" : ""})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No hours data matches these filters.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proposal Name</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Scenario</TableHead>
                      <TableHead className="text-right">Sr IM Hours</TableHead>
                      <TableHead className="text-right">PM Hours</TableHead>
                      <TableHead className="text-right">BA Hours</TableHead>
                      <TableHead className="text-right">Total Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={`${r.proposalId}-${r.scenario}-${i}`}>
                        <TableCell className="font-medium">
                          {r.proposalName}
                        </TableCell>
                        <TableCell>{r.customerName}</TableCell>
                        <TableCell>{r.scenario}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(r.srImHours)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(r.pmHours)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(r.baHours)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(r.totalHours)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={3}>Totals</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(totals.sr)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(totals.pm)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(totals.ba)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(totals.total)}
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
