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
import * as XLSX from "xlsx";

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

    // Fetch all related data in parallel
    const [scenarioRes, scopedRes, migrationRes] = await Promise.all([
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
        .select("proposal_id, computed_total_cost")
        .in("proposal_id", proposalIds),
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

    // Migration cost map: proposalId -> total
    const migrationMap = new Map<string, number>();
    for (const m of migrationRes.data ?? []) {
      migrationMap.set(m.proposal_id, Number(m.computed_total_cost) || 0);
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

  const exportXLSX = useCallback(() => {
    if (rows.length === 0) return;

    const exportRows = rows.map((r) => ({
      Customer: r.customerName,
      Proposal: r.proposalName,
      Status: r.status,
      P1: r.p1Cost,
      P2: r.p2Cost,
      Opt1: r.opt1Cost,
      Opt2: r.opt2Cost,
      "Scoped Services": r.scopedCost,
      "Migration Services": r.migrationCost,
      "Grand Total": r.grandTotal,
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proposal Log");
    XLSX.writeFile(
      wb,
      `proposal-log-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }, [rows]);

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
