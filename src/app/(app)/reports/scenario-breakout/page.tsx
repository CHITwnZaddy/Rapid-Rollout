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
import { formatCurrency } from "@/lib/calculations/engine";
import {
  calculateLineImports,
  effectiveTotalLineItems,
  calculateDocumentHours,
  type MigrationDetailLine,
} from "@/lib/calculations/migration-engine";
import * as XLSX from "xlsx";

interface Proposal {
  id: string;
  name: string;
}

interface ScenarioLine {
  module: string;
  scope_selection: string | null;
  total_cost: number;
}

interface ScenarioGroup {
  scenarioType: string;
  lines: ScenarioLine[];
  totalCost: number;
}

interface ScopedLine {
  service_type: string;
  description: string | null;
  cost: number;
}

interface MigrationConfig {
  num_projects: number;
  hrs_per_import: number;
  lines_per_import_file: number;
  is_effort_included: boolean;
  is_workshop_included: boolean;
  ba_complexity_factor: number;
  pm_complexity_factor: number;
  ba_trips: number;
  pm_trips: number;
  doc_avg_mb_per_project: number;
  doc_mb_per_hour: number;
  core_requirements_hrs: number;
  core_migration_plan_hrs: number;
  core_validation_hrs: number;
  core_final_qa_hrs: number;
  core_pm_oversight_hrs: number;
  computed_total_cost: number;
}

interface MigrationLine {
  section: string;
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
}

const NUM = (v: unknown) => Number(v) || 0;

export default function ScenarioBreakoutReport() {
  const supabase = createClient();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState("");
  const [scenarioGroups, setScenarioGroups] = useState<ScenarioGroup[]>([]);
  const [scopedLines, setScopedLines] = useState<ScopedLine[]>([]);
  const [migrationConfig, setMigrationConfig] = useState<MigrationConfig | null>(null);
  const [migrationLines, setMigrationLines] = useState<MigrationLine[]>([]);
  // Rates are fail-closed: start as null, require successful fetch
  // before the report can be run. See Phase 1.3 in the remediation
  // plan for rationale.
  const [baRate, setBaRate] = useState<number | null>(null);
  const [pmRate, setPmRate] = useState<number | null>(null);
  const [travelRate, setTravelRate] = useState<number | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [rateReloadToken, setRateReloadToken] = useState(0);

  useEffect(() => {
    supabase
      .from("proposals")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (data) setProposals(data);
      });
  }, [supabase]);

  // Rate-card loader: fail closed on error or missing rows. The
  // report refuses to run until this resolves successfully.
  useEffect(() => {
    let cancelled = false;
    setRateError(null);
    supabase
      .from("rate_cards")
      .select("lookup_key, rate")
      .in("lookup_key", [
        "Master|Business Analyst",
        "Master|Program Manager",
        "Master|Travel Cost/Trip",
      ])
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setRateError(
            error?.message ??
              "Unable to reach the rate card table. Check your connection and retry."
          );
          return;
        }
        const map = new Map(data.map((r) => [r.lookup_key, NUM(r.rate)]));
        const ba = map.get("Master|Business Analyst");
        const pm = map.get("Master|Program Manager");
        const travel = map.get("Master|Travel Cost/Trip");
        if (ba == null || pm == null || travel == null) {
          setRateError(
            "One or more required rate card rows are missing (Business Analyst, Program Manager, Travel Cost/Trip)."
          );
          return;
        }
        setBaRate(ba);
        setPmRate(pm);
        setTravelRate(travel);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, rateReloadToken]);

  const ratesReady =
    baRate != null && pmRate != null && travelRate != null && !rateError;

  const runReport = useCallback(async () => {
    if (!selectedProposal) return;
    setLoading(true);
    setHasRun(true);

    const [scenarioRes, linesRes, scopedRes, migCfgRes, migLinesRes] =
      await Promise.all([
        supabase
          .from("scenarios")
          .select("id, scenario_type, summary_total_cost")
          .eq("proposal_id", selectedProposal)
          .order("scenario_type"),
        supabase
          .from("scenario_lines")
          .select("scenario_id, module, scope_selection, total_cost")
          .in(
            "scenario_id",
            (
              await supabase
                .from("scenarios")
                .select("id")
                .eq("proposal_id", selectedProposal)
            ).data?.map((s) => s.id) ?? []
          )
          .order("row_order"),
        supabase
          .from("scoped_services")
          .select("service_type, description, cost")
          .eq("proposal_id", selectedProposal)
          .order("row_order"),
        supabase
          .from("migration_config")
          .select("*")
          .eq("proposal_id", selectedProposal)
          .single(),
        supabase
          .from("migration_detail_lines")
          .select("section, label, quantity, items_per_object, total_line_items")
          .eq("proposal_id", selectedProposal)
          .order("section")
          .order("row_order"),
      ]);

    // Build scenario groups
    const scenarios = scenarioRes.data ?? [];
    const allLines = linesRes.data ?? [];
    const scenarioIdMap = new Map(scenarios.map((s) => [s.id, s.scenario_type]));

    const order = ["P1", "P2", "Opt1", "Opt2"];
    const groups: ScenarioGroup[] = order
      .map((type) => {
        const scenario = scenarios.find((s) => s.scenario_type === type);
        if (!scenario) return null;
        const lines = allLines
          .filter((l) => scenarioIdMap.get(l.scenario_id) === type)
          .filter((l) => NUM(l.total_cost) > 0)
          .map((l) => ({
            module: l.module,
            scope_selection: l.scope_selection,
            total_cost: NUM(l.total_cost),
          }));
        return {
          scenarioType: type,
          lines,
          totalCost: NUM(scenario.summary_total_cost),
        };
      })
      .filter(Boolean) as ScenarioGroup[];

    setScenarioGroups(groups);

    // Scoped services
    const scoped = (scopedRes.data ?? [])
      .filter((s) => NUM(s.cost) > 0)
      .map((s) => ({
        service_type: s.service_type,
        description: s.description,
        cost: NUM(s.cost),
      }));
    setScopedLines(scoped);

    // Migration
    if (migCfgRes.data) {
      setMigrationConfig(migCfgRes.data as MigrationConfig);
    } else {
      setMigrationConfig(null);
    }
    setMigrationLines((migLinesRes.data ?? []) as MigrationLine[]);

    setLoading(false);
  }, [supabase, selectedProposal]);

  // Compute migration section subtotals
  function migSectionHours(section: string): number {
    if (!migrationConfig) return 0;
    const sectionLines = migrationLines.filter((l) => l.section === section);
    return sectionLines.reduce((sum, l) => {
      const numProjects = NUM(migrationConfig.num_projects);
      const el: MigrationDetailLine = {
        id: "",
        section: l.section as "project" | "workflow" | "cost",
        label: l.label,
        quantity: l.section === "project" ? numProjects : NUM(l.quantity),
        items_per_object: NUM(l.items_per_object),
        total_line_items: NUM(l.total_line_items),
        row_order: 0,
      };
      const total = effectiveTotalLineItems(el);
      const calc = calculateLineImports(
        total,
        NUM(migrationConfig.lines_per_import_file),
        NUM(migrationConfig.hrs_per_import)
      );
      return sum + calc.totalHours;
    }, 0);
  }

  function migSectionCost(hours: number): number {
    if (baRate == null) return 0;
    return hours * NUM(migrationConfig?.ba_complexity_factor) * baRate;
  }

  const exportXLSX = useCallback(() => {
    const rows: Array<Record<string, string | number>> = [];

    for (const g of scenarioGroups) {
      for (const l of g.lines) {
        rows.push({
          Section: g.scenarioType,
          Item: l.module,
          Detail: l.scope_selection ?? "",
          Subtotal: l.total_cost,
        });
      }
      rows.push({
        Section: `${g.scenarioType} Total`,
        Item: "",
        Detail: "",
        Subtotal: g.totalCost,
      });
    }

    if (scopedLines.length > 0) {
      for (const s of scopedLines) {
        rows.push({
          Section: "Scoped Services",
          Item: s.service_type,
          Detail: s.description ?? "",
          Subtotal: s.cost,
        });
      }
      rows.push({
        Section: "Scoped Services Total",
        Item: "",
        Detail: "",
        Subtotal: scopedLines.reduce((sum, l) => sum + l.cost, 0),
      });
    }

    if (migrationConfig) {
      rows.push({
        Section: "Migration Services",
        Item: "Total",
        Detail: "",
        Subtotal: Number(migrationConfig.computed_total_cost) || 0,
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scenario Breakout");

    const proposalName =
      proposals.find((p) => p.id === selectedProposal)?.name ?? "report";

    XLSX.writeFile(
      wb,
      `scenario-breakout-${proposalName}-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }, [scenarioGroups, scopedLines, migrationConfig, proposals, selectedProposal]);

  // Migration detail helpers
  const projectLines = migrationLines.filter((l) => l.section === "project");
  const workflowLines = migrationLines
    .filter((l) => l.section === "workflow")
    .filter((l) => l.label && l.label !== "WF Object Name" && l.label.trim() !== "");
  const costDataLines = migrationLines
    .filter((l) => l.section === "cost")
    .filter((l) => l.label && l.label !== "TBD" && l.label.trim() !== "");

  const projectHours = migSectionHours("project");
  const workflowHours = migSectionHours("workflow");
  const costDataHours = migSectionHours("cost");
  const docHours = migrationConfig
    ? calculateDocumentHours({
        num_projects: NUM(migrationConfig.num_projects),
        hrs_per_import: NUM(migrationConfig.hrs_per_import),
        lines_per_import_file: NUM(migrationConfig.lines_per_import_file),
        is_effort_included: migrationConfig.is_effort_included,
        is_workshop_included: migrationConfig.is_workshop_included,
        pm_contingency_pct: 0,
        ba_complexity_factor: NUM(migrationConfig.ba_complexity_factor),
        pm_complexity_factor: NUM(migrationConfig.pm_complexity_factor),
        ba_trips: NUM(migrationConfig.ba_trips),
        pm_trips: NUM(migrationConfig.pm_trips),
        doc_avg_mb_per_project: NUM(migrationConfig.doc_avg_mb_per_project),
        doc_mb_per_hour: NUM(migrationConfig.doc_mb_per_hour),
        core_requirements_hrs: 0,
        core_migration_plan_hrs: 0,
        core_validation_hrs: 0,
        core_final_qa_hrs: 0,
        core_pm_oversight_hrs: 0,
      })
    : 0;

  const hasTravelData =
    NUM(migrationConfig?.ba_trips) > 0 || NUM(migrationConfig?.pm_trips) > 0;

  // Core effort hours
  const coreEffortHours = migrationConfig?.is_effort_included
    ? NUM(migrationConfig.core_requirements_hrs) +
      NUM(migrationConfig.core_migration_plan_hrs) +
      NUM(migrationConfig.core_validation_hrs) +
      NUM(migrationConfig.core_final_qa_hrs)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Scenario Breakout Report</h1>

      {rateError && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unable to load pricing data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              This report depends on the rate card table. To prevent stale
              defaults from mis-pricing a deal, the report has been blocked
              until rates load successfully.
            </p>
            <p className="font-mono text-xs text-destructive">{rateError}</p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Proposal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Proposal</Label>
              <Select
                value={selectedProposal}
                onValueChange={(v) => setSelectedProposal(v ?? "")}
              >
                <SelectTrigger className="h-8 w-[300px]">
                  <SelectValue placeholder="Select a proposal">
                    {proposals.find((p) => p.id === selectedProposal)?.name ??
                      "Select a proposal"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {proposals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={runReport}
              disabled={loading || !selectedProposal || !ratesReady}
            >
              {loading ? "Running..." : "Run Report"}
            </Button>
            {rateError && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRateReloadToken((n) => n + 1)}
              >
                Retry loading rates
              </Button>
            )}
            {hasRun && scenarioGroups.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportXLSX}>
                Export XLSX
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {hasRun && (
        <div className="space-y-6">
          {/* Scenarios */}
          {scenarioGroups.map((g) => (
            <Card key={g.scenarioType}>
              <CardHeader>
                <CardTitle className="text-base">{g.scenarioType}</CardTitle>
              </CardHeader>
              <CardContent>
                {g.lines.length === 0 ? (
                  <p className="py-4 text-center text-muted-foreground">
                    No configured modules.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Module</TableHead>
                          <TableHead>Scope</TableHead>
                          <TableHead className="text-right">Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.lines.map((l, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">
                              {l.module}
                            </TableCell>
                            <TableCell>{l.scope_selection ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(l.total_cost)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell colSpan={2}>
                            {g.scenarioType} Total
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(g.totalCost)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Scoped Services */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scoped Services</CardTitle>
            </CardHeader>
            <CardContent>
              {scopedLines.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  No scoped services.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scopedLines.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            {s.service_type}
                          </TableCell>
                          <TableCell>{s.description ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(s.cost)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={2}>Scoped Services Total</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(
                            scopedLines.reduce((s, l) => s + l.cost, 0)
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Migration Services */}
          {migrationConfig && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Migration Services</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Migration Configuration / Core Efforts */}
                {migrationConfig.is_effort_included && coreEffortHours > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Migration Configuration (Core Efforts)
                    </h4>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Phase</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>Core Data Migration Efforts</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(
                                coreEffortHours *
                                  NUM(migrationConfig.ba_complexity_factor) *
                                  (baRate ?? 0)
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Project & Schedule */}
                {projectHours > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Project & Schedule Data Migration
                    </h4>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {projectLines.map((l, i) => {
                            const numP = NUM(migrationConfig.num_projects);
                            const el: MigrationDetailLine = {
                              id: "",
                              section: "project",
                              label: l.label,
                              quantity: numP,
                              items_per_object: NUM(l.items_per_object),
                              total_line_items: NUM(l.total_line_items),
                              row_order: 0,
                            };
                            const t = effectiveTotalLineItems(el);
                            const c = calculateLineImports(
                              t,
                              NUM(migrationConfig.lines_per_import_file),
                              NUM(migrationConfig.hrs_per_import)
                            );
                            if (c.totalHours === 0) return null;
                            return (
                              <TableRow key={i}>
                                <TableCell>{l.label}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatCurrency(
                                    c.totalHours *
                                      NUM(migrationConfig.ba_complexity_factor) *
                                      (baRate ?? 0)
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell>Project & Schedule Total</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(migSectionCost(projectHours))}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Workflow Data */}
                {workflowLines.length > 0 && workflowHours > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Workflow Data Migration
                    </h4>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Workflow Data Description</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {workflowLines.map((l, i) => {
                            const el: MigrationDetailLine = {
                              id: "",
                              section: "workflow",
                              label: l.label,
                              quantity: NUM(l.quantity),
                              items_per_object: NUM(l.items_per_object),
                              total_line_items: NUM(l.total_line_items),
                              row_order: 0,
                            };
                            const t = effectiveTotalLineItems(el);
                            const c = calculateLineImports(
                              t,
                              NUM(migrationConfig.lines_per_import_file),
                              NUM(migrationConfig.hrs_per_import)
                            );
                            if (c.totalHours === 0) return null;
                            return (
                              <TableRow key={i}>
                                <TableCell>{l.label}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatCurrency(
                                    c.totalHours *
                                      NUM(migrationConfig.ba_complexity_factor) *
                                      (baRate ?? 0)
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell>Workflow Total</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(migSectionCost(workflowHours))}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Cost Data */}
                {costDataLines.length > 0 && costDataHours > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Cost Data Migration
                    </h4>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cost Object</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {costDataLines.map((l, i) => {
                            const el: MigrationDetailLine = {
                              id: "",
                              section: "cost",
                              label: l.label,
                              quantity: NUM(l.quantity),
                              items_per_object: NUM(l.items_per_object),
                              total_line_items: NUM(l.total_line_items),
                              row_order: 0,
                            };
                            const t = effectiveTotalLineItems(el);
                            const c = calculateLineImports(
                              t,
                              NUM(migrationConfig.lines_per_import_file),
                              NUM(migrationConfig.hrs_per_import)
                            );
                            if (c.totalHours === 0) return null;
                            return (
                              <TableRow key={i}>
                                <TableCell>{l.label}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatCurrency(
                                    c.totalHours *
                                      NUM(migrationConfig.ba_complexity_factor) *
                                      (baRate ?? 0)
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell>Cost Data Total</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(migSectionCost(costDataHours))}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Document Migration */}
                {docHours > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      Document Migration
                    </h4>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Detail</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>
                              Avg MB:{" "}
                              {NUM(
                                migrationConfig.doc_avg_mb_per_project
                              ).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatCurrency(
                                docHours *
                                  NUM(migrationConfig.ba_complexity_factor) *
                                  (baRate ?? 0)
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Travel */}
                {hasTravelData && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Travel</h4>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Role</TableHead>
                            <TableHead className="text-right">Trips</TableHead>
                            <TableHead className="text-right">
                              Hours Cost
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {NUM(migrationConfig.ba_trips) > 0 && (
                            <TableRow>
                              <TableCell>BA Travel</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {migrationConfig.ba_trips}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrency(
                                  NUM(migrationConfig.ba_trips) *
                                    40 *
                                    NUM(migrationConfig.ba_complexity_factor) *
                                    (baRate ?? 0)
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                          {NUM(migrationConfig.pm_trips) > 0 && (
                            <TableRow>
                              <TableCell>PM II Travel</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {migrationConfig.pm_trips}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrency(
                                  NUM(migrationConfig.pm_trips) *
                                    40 *
                                    NUM(migrationConfig.pm_complexity_factor) *
                                    (pmRate ?? 0)
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Migration Grand Total */}
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="flex justify-between text-base font-bold">
                    <span>Migration Services Total</span>
                    <span className="tabular-nums">
                      {formatCurrency(NUM(migrationConfig.computed_total_cost))}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
