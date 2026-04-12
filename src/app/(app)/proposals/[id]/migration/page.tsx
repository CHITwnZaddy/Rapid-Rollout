"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  calculateMigrationTotals,
  effectiveTotalLineItems,
  DEFAULT_PROJECT_LINES,
  DEFAULT_WORKFLOW_LINES,
  DEFAULT_COST_LINES,
  type MigrationConfig,
  type MigrationDetailLine,
  type MigrationTotals,
} from "@/lib/calculations/migration-engine";

// ─── Types ───────────────────────────────────────────────────────────

interface DbConfig {
  id: string;
  proposal_id: string;
  num_projects: number;
  hrs_per_import: number;
  lines_per_import_file: number;
  is_effort_included: boolean;
  is_workshop_included: boolean;
  pm_contingency_pct: number;
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

interface DbLine {
  id: string;
  proposal_id: string;
  section: string;
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
  row_order: number;
}

const NUM = (v: unknown) => Number(v) || 0;

// ─── Component ───────────────────────────────────────────────────────

export default function MigrationPage() {
  const { id: proposalId } = useParams<{ id: string }>();
  const supabase = createClient();

  const [config, setConfig] = useState<DbConfig | null>(null);
  const [lines, setLines] = useState<DbLine[]>([]);
  const [baRate, setBaRate] = useState(225);
  const [pmRate, setPmRate] = useState(225);
  const [travelRate, setTravelRate] = useState(2250);
  const [loading, setLoading] = useState(true);

  // Refs for debounced save
  const configRef = useRef(config);
  const linesRef = useRef(lines);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  configRef.current = config;
  linesRef.current = lines;

  // ─── Load data ───────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      // Load rate cards for BA, PM, Travel
      const { data: rates } = await supabase
        .from("rate_cards")
        .select("lookup_key, rate")
        .in("lookup_key", [
          "Master|Business Analyst",
          "Master|Program Manager",
          "Master|Travel Cost/Trip",
        ]);

      if (rates) {
        for (const r of rates) {
          if (r.lookup_key === "Master|Business Analyst") setBaRate(NUM(r.rate));
          if (r.lookup_key === "Master|Program Manager") setPmRate(NUM(r.rate));
          if (r.lookup_key === "Master|Travel Cost/Trip") setTravelRate(NUM(r.rate));
        }
      }

      // Load or create migration config
      let { data: cfg } = await supabase
        .from("migration_config")
        .select("*")
        .eq("proposal_id", proposalId)
        .single();

      if (!cfg) {
        // Create default config
        const { data: newCfg } = await supabase
          .from("migration_config")
          .insert({ proposal_id: proposalId })
          .select()
          .single();
        cfg = newCfg;
      }

      if (cfg) setConfig(cfg as DbConfig);

      // Load or create detail lines
      let { data: existingLines } = await supabase
        .from("migration_detail_lines")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("section")
        .order("row_order");

      if (!existingLines || existingLines.length === 0) {
        // Create default lines
        const allDefaults = [
          ...DEFAULT_PROJECT_LINES,
          ...DEFAULT_WORKFLOW_LINES,
          ...DEFAULT_COST_LINES,
        ].map((l) => ({ ...l, proposal_id: proposalId }));

        const { data: newLines } = await supabase
          .from("migration_detail_lines")
          .insert(allDefaults)
          .select();

        existingLines = newLines;
      }

      if (existingLines) setLines(existingLines as DbLine[]);
      setLoading(false);
    };
    load();
  }, [proposalId, supabase]);

  // ─── Save helpers ────────────────────────────────────────────────

  const saveConfig = useCallback(
    async (updated: DbConfig) => {
      const totals = computeTotals(updated, linesRef.current);
      const totalCost = totals?.salesPrice ?? 0;
      await supabase
        .from("migration_config")
        .update({
          num_projects: updated.num_projects,
          hrs_per_import: updated.hrs_per_import,
          lines_per_import_file: updated.lines_per_import_file,
          is_effort_included: updated.is_effort_included,
          is_workshop_included: updated.is_workshop_included,
          pm_contingency_pct: updated.pm_contingency_pct,
          ba_complexity_factor: updated.ba_complexity_factor,
          pm_complexity_factor: updated.pm_complexity_factor,
          ba_trips: updated.ba_trips,
          pm_trips: updated.pm_trips,
          doc_avg_mb_per_project: updated.doc_avg_mb_per_project,
          doc_mb_per_hour: updated.doc_mb_per_hour,
          core_requirements_hrs: updated.core_requirements_hrs,
          core_migration_plan_hrs: updated.core_migration_plan_hrs,
          core_validation_hrs: updated.core_validation_hrs,
          core_final_qa_hrs: updated.core_final_qa_hrs,
          core_pm_oversight_hrs: updated.core_pm_oversight_hrs,
          computed_total_cost: totalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("id", updated.id);
    },
    [supabase]
  );

  const saveLine = useCallback(
    async (line: DbLine) => {
      await supabase
        .from("migration_detail_lines")
        .update({
          label: line.label,
          quantity: line.quantity,
          items_per_object: line.items_per_object,
          total_line_items: line.total_line_items,
        })
        .eq("id", line.id);
    },
    [supabase]
  );

  const debouncedSaveConfig = useCallback(
    (updated: DbConfig) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveConfig(updated);
      }, 800);
    },
    [saveConfig]
  );

  const debouncedSaveLine = useCallback(
    (line: DbLine) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await saveLine(line);
        // Also update computed_total_cost
        if (configRef.current) {
          const totals = computeTotals(configRef.current, linesRef.current);
          if (totals) {
            await supabase
              .from("migration_config")
              .update({ computed_total_cost: totals.salesPrice, updated_at: new Date().toISOString() })
              .eq("id", configRef.current.id);
          }
        }
      }, 800);
    },
    [saveLine, supabase]
  );

  // Save on unmount
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      // Fire final save
      if (configRef.current) {
        const totals = computeTotals(configRef.current, linesRef.current);
        if (totals) {
          supabase
            .from("migration_config")
            .update({ computed_total_cost: totals.salesPrice, updated_at: new Date().toISOString() })
            .eq("id", configRef.current.id);
        }
      }
    };
  }, [supabase]);

  // ─── Update helpers ──────────────────────────────────────────────

  const updateConfig = useCallback(
    (field: keyof DbConfig, value: number | boolean | string) => {
      if (!config) return;
      const updated = { ...config, [field]: value };

      // Enforce mutual exclusion: both can't be Yes
      if (field === "is_effort_included" && value === true) {
        updated.is_workshop_included = false;
      }
      if (field === "is_workshop_included" && value === true) {
        updated.is_effort_included = false;
      }

      setConfig(updated);
      debouncedSaveConfig(updated);
    },
    [config, debouncedSaveConfig]
  );

  const updateLine = useCallback(
    (lineId: string, field: keyof DbLine, value: string | number) => {
      setLines((prev) => {
        const next = prev.map((l) =>
          l.id === lineId ? { ...l, [field]: value } : l
        );
        const updated = next.find((l) => l.id === lineId);
        if (updated) debouncedSaveLine(updated);
        return next;
      });
    },
    [debouncedSaveLine]
  );

  const addLine = useCallback(
    async (section: "project" | "workflow" | "cost") => {
      const sectionLines = lines.filter((l) => l.section === section);
      const nextOrder = sectionLines.length;
      const label =
        section === "workflow"
          ? "WF Object Name"
          : section === "cost"
            ? "TBD"
            : "New Item";

      const { data } = await supabase
        .from("migration_detail_lines")
        .insert({
          proposal_id: proposalId,
          section,
          label,
          quantity: 0,
          items_per_object: 0,
          total_line_items: 0,
          row_order: nextOrder,
        })
        .select()
        .single();

      if (data) setLines((prev) => [...prev, data as DbLine]);
    },
    [lines, proposalId, supabase]
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      await supabase.from("migration_detail_lines").delete().eq("id", lineId);
      setLines((prev) => prev.filter((l) => l.id !== lineId));
    },
    [supabase]
  );

  // ─── Calculations ────────────────────────────────────────────────

  function computeTotals(
    cfg: DbConfig | null,
    allLines: DbLine[]
  ): MigrationTotals | null {
    if (!cfg) return null;
    const mc: MigrationConfig = {
      num_projects: NUM(cfg.num_projects),
      hrs_per_import: NUM(cfg.hrs_per_import),
      lines_per_import_file: NUM(cfg.lines_per_import_file),
      is_effort_included: cfg.is_effort_included,
      is_workshop_included: cfg.is_workshop_included,
      pm_contingency_pct: NUM(cfg.pm_contingency_pct),
      ba_complexity_factor: NUM(cfg.ba_complexity_factor),
      pm_complexity_factor: NUM(cfg.pm_complexity_factor),
      ba_trips: NUM(cfg.ba_trips),
      pm_trips: NUM(cfg.pm_trips),
      doc_avg_mb_per_project: NUM(cfg.doc_avg_mb_per_project),
      doc_mb_per_hour: NUM(cfg.doc_mb_per_hour),
      core_requirements_hrs: NUM(cfg.core_requirements_hrs),
      core_migration_plan_hrs: NUM(cfg.core_migration_plan_hrs),
      core_validation_hrs: NUM(cfg.core_validation_hrs),
      core_final_qa_hrs: NUM(cfg.core_final_qa_hrs),
      core_pm_oversight_hrs: NUM(cfg.core_pm_oversight_hrs),
    };

    const pLines = allLines
      .filter((l) => l.section === "project")
      .map(toEngineLine);
    const wLines = allLines
      .filter((l) => l.section === "workflow")
      .map(toEngineLine);
    const cLines = allLines
      .filter((l) => l.section === "cost")
      .map(toEngineLine);

    return calculateMigrationTotals(
      mc,
      pLines,
      wLines,
      cLines,
      baRate,
      pmRate,
      travelRate
    );
  }

  function toEngineLine(l: DbLine): MigrationDetailLine {
    return {
      id: l.id,
      section: l.section as "project" | "workflow" | "cost",
      label: l.label,
      quantity: NUM(l.quantity),
      items_per_object: NUM(l.items_per_object),
      total_line_items: NUM(l.total_line_items),
      row_order: l.row_order,
    };
  }

  const totals = computeTotals(config, lines);

  // Group lines by section
  const projectLines = lines.filter((l) => l.section === "project");
  const workflowLines = lines.filter((l) => l.section === "workflow");
  const costLines = lines.filter((l) => l.section === "cost");

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Loading migration services...</div>;
  }

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Configuration ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Migration Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Number of Projects</Label>
              <Input
                type="number"
                min={0}
                className="h-8"
                value={config?.num_projects ?? 0}
                onChange={(e) =>
                  updateConfig("num_projects", parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hrs / Standard Import</Label>
              <Input
                type="number"
                min={0}
                step={0.25}
                className="h-8"
                value={config?.hrs_per_import ?? 0.75}
                onChange={(e) =>
                  updateConfig("hrs_per_import", parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs"># of Lines / Import File</Label>
              <Input
                type="number"
                min={1}
                className="h-8"
                value={config?.lines_per_import_file ?? 2550}
                onChange={(e) =>
                  updateConfig(
                    "lines_per_import_file",
                    parseInt(e.target.value) || 2550
                  )
                }
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">
                Is Data Migration Effort Included?
              </Label>
              <Select
                value={config?.is_effort_included ? "Yes" : "No"}
                onValueChange={(v) =>
                  updateConfig("is_effort_included", v === "Yes")
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Is Data Migration Workshop Included?
              </Label>
              <Select
                value={config?.is_workshop_included ? "Yes" : "No"}
                onValueChange={(v) =>
                  updateConfig("is_workshop_included", v === "Yes")
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
              {config?.is_effort_included && config?.is_workshop_included && (
                <p className="text-xs text-destructive">
                  Both cannot be set to Yes
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">PM Contingency %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                className="h-8"
                value={Math.round(NUM(config?.pm_contingency_pct) * 100)}
                onChange={(e) =>
                  updateConfig(
                    "pm_contingency_pct",
                    (parseFloat(e.target.value) || 0) / 100
                  )
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Core Efforts (when effort = Yes) ──────────────────────── */}
      {config?.is_effort_included && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Core Data Migration Efforts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-5">
              {[
                { label: "Requirements", field: "core_requirements_hrs" as const },
                { label: "Migration Plan", field: "core_migration_plan_hrs" as const },
                { label: "Plan Validation/QA", field: "core_validation_hrs" as const },
                { label: "Final Q/A", field: "core_final_qa_hrs" as const },
                { label: "PM Oversight", field: "core_pm_oversight_hrs" as const },
              ].map(({ label, field }) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8"
                    value={NUM(config?.[field])}
                    onChange={(e) =>
                      updateConfig(field, parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Project & Schedule Data ───────────────────────────────── */}
      <DetailSection
        title="Project & Schedule Data Migration"
        section="project"
        lines={projectLines}
        config={config}
        qtyLabel="# of Projects"
        itemsLabel="Line Items / Object"
        totalEditable
        onUpdateLine={updateLine}
        onAddLine={addLine}
        onRemoveLine={removeLine}
      />

      {/* ── Workflow Data ─────────────────────────────────────────── */}
      <DetailSection
        title="Workflow Data Migration"
        section="workflow"
        lines={workflowLines}
        config={config}
        qtyLabel="# of Instances"
        itemsLabel="Line Items / Object"
        totalEditable
        labelEditable
        onUpdateLine={updateLine}
        onAddLine={addLine}
        onRemoveLine={removeLine}
      />

      {/* ── Cost Data ─────────────────────────────────────────────── */}
      <DetailSection
        title="Cost Data Migration"
        section="cost"
        lines={costLines}
        config={config}
        qtyLabel="Avg / Project"
        itemsLabel="Line Items / Object"
        totalEditable={false}
        labelEditable
        onUpdateLine={updateLine}
        onAddLine={addLine}
        onRemoveLine={removeLine}
      />

      {/* ── Document Migration ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Migration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Avg MB / Project</Label>
              <Input
                type="number"
                min={0}
                className="h-8"
                value={NUM(config?.doc_avg_mb_per_project)}
                onChange={(e) =>
                  updateConfig(
                    "doc_avg_mb_per_project",
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">MB / Hour</Label>
              <Input
                type="number"
                min={0}
                className="h-8"
                value={NUM(config?.doc_mb_per_hour)}
                onChange={(e) =>
                  updateConfig(
                    "doc_mb_per_hour",
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Calculated Hours</Label>
              <div className="flex h-8 items-center rounded-md bg-muted px-3 text-sm font-medium tabular-nums">
                {(totals?.documentRaw ?? 0).toFixed(1)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Services & Hours Summary ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Services & Hours Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Hours breakdown */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section</TableHead>
                  <TableHead className="text-right">BA Hours</TableHead>
                  <TableHead className="text-right">PM II Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config?.is_workshop_included && (
                  <TableRow>
                    <TableCell>Data Migration Workshop</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(totals?.workshopBa ?? 0).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(totals?.workshopPm ?? 0).toFixed(1)}
                    </TableCell>
                  </TableRow>
                )}
                {config?.is_effort_included && (
                  <TableRow>
                    <TableCell>Data Migration Core</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(totals?.coreBa ?? 0).toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(totals?.corePm ?? 0).toFixed(1)}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow>
                  <TableCell>Project & Schedule Data</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totals?.projectBa ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    —
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Workflow Data</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totals?.workflowBa ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    —
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Cost Data</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totals?.costBa ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    —
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Document Data</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totals?.documentBa ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    —
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Travel</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totals?.travelBa ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totals?.travelPm ?? 0).toFixed(1)}
                  </TableCell>
                </TableRow>
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Total Hours</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totals?.totalBaHours ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totals?.totalPmHours ?? 0).toFixed(1)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Travel & Complexity */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-sm font-medium">Travel</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">BA Trips</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8"
                    value={config?.ba_trips ?? 0}
                    onChange={(e) =>
                      updateConfig("ba_trips", parseInt(e.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">PM II Trips</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8"
                    value={config?.pm_trips ?? 0}
                    onChange={(e) =>
                      updateConfig("pm_trips", parseInt(e.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Estimated T&E: {formatCurrency(totals?.travelExpense ?? 0)}
              </p>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-medium">
                Complexity Factor
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">BA Factor</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    className="h-8"
                    value={config?.ba_complexity_factor ?? 1}
                    onChange={(e) =>
                      updateConfig(
                        "ba_complexity_factor",
                        parseFloat(e.target.value) || 1
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">PM II Factor</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    className="h-8"
                    value={config?.pm_complexity_factor ?? 1}
                    onChange={(e) =>
                      updateConfig(
                        "pm_complexity_factor",
                        parseFloat(e.target.value) || 1
                      )
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Cost Summary */}
          <div className="rounded-md border bg-muted/30 p-4">
            <h4 className="mb-3 text-sm font-semibold">Cost Summary</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>
                  BA Cost: {(totals?.totalBaHours ?? 0).toFixed(1)} hrs ×{" "}
                  {formatCurrency(baRate)}/hr
                </span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(totals?.baCost ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>
                  PM Cost: {(totals?.totalPmHours ?? 0).toFixed(1)} hrs ×{" "}
                  {formatCurrency(pmRate)}/hr
                </span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(totals?.pmCost ?? 0)}
                </span>
              </div>
              <div className="my-2 border-t" />
              <div className="flex justify-between text-base font-bold">
                <span>Data Migration Sales Price</span>
                <span className="tabular-nums">
                  {formatCurrency(totals?.salesPrice ?? 0)}
                </span>
              </div>
              {(totals?.blendedRate ?? 0) > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Blended Billing Rate</span>
                    <span className="tabular-nums">
                      {formatCurrency(totals?.blendedRate ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Estimated Sales Margin</span>
                    <span className="tabular-nums">
                      {((totals?.estimatedMargin ?? 0) * 100).toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Detail Section Sub-component ────────────────────────────────────

interface DetailSectionProps {
  title: string;
  section: "project" | "workflow" | "cost";
  lines: DbLine[];
  config: DbConfig | null;
  qtyLabel: string;
  itemsLabel: string;
  totalEditable: boolean;
  labelEditable?: boolean;
  onUpdateLine: (id: string, field: keyof DbLine, value: string | number) => void;
  onAddLine: (section: "project" | "workflow" | "cost") => void;
  onRemoveLine: (id: string) => void;
}

function DetailSection({
  title,
  section,
  lines,
  config,
  qtyLabel,
  itemsLabel,
  totalEditable,
  labelEditable,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
}: DetailSectionProps) {
  const hrsPerImport = NUM(config?.hrs_per_import);
  const linesPerFile = NUM(config?.lines_per_import_file);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" variant="outline" onClick={() => onAddLine(section)}>
          + Add Row
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Label</TableHead>
                <TableHead className="w-[90px] text-right">{qtyLabel}</TableHead>
                <TableHead className="w-[90px] text-right">{itemsLabel}</TableHead>
                <TableHead className="w-[100px] text-right">
                  Total # Items
                </TableHead>
                <TableHead className="w-[80px] text-right"># Imports</TableHead>
                <TableHead className="w-[70px] text-right">Hrs/Imp</TableHead>
                <TableHead className="w-[80px] text-right">
                  Total Hours
                </TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const engineLine = {
                  ...line,
                  section: line.section as "project" | "workflow" | "cost",
                  quantity: NUM(line.quantity),
                  items_per_object: NUM(line.items_per_object),
                  total_line_items: NUM(line.total_line_items),
                };
                const effTotal = effectiveTotalLineItems(engineLine);
                const calc = calculateLineImports(
                  effTotal,
                  linesPerFile,
                  hrsPerImport
                );
                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      {labelEditable ? (
                        <Input
                          className="h-7 text-xs"
                          value={line.label}
                          onChange={(e) =>
                            onUpdateLine(line.id, "label", e.target.value)
                          }
                        />
                      ) : (
                        <span className="text-sm">{line.label}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 text-right text-xs"
                        type="number"
                        min={0}
                        value={NUM(line.quantity)}
                        onChange={(e) =>
                          onUpdateLine(
                            line.id,
                            "quantity",
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 text-right text-xs"
                        type="number"
                        min={0}
                        value={NUM(line.items_per_object)}
                        onChange={(e) =>
                          onUpdateLine(
                            line.id,
                            "items_per_object",
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {totalEditable ? (
                        <Input
                          className="h-7 text-right text-xs"
                          type="number"
                          min={0}
                          value={NUM(line.total_line_items)}
                          onChange={(e) =>
                            onUpdateLine(
                              line.id,
                              "total_line_items",
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      ) : (
                        <div className="text-right text-sm tabular-nums">
                          {effTotal.toLocaleString()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {calc.numImports}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {hrsPerImport}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {calc.totalHours.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-destructive"
                        onClick={() => onRemoveLine(line.id)}
                      >
                        ×
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {lines.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-6 text-center text-muted-foreground"
                  >
                    No rows. Click &quot;+ Add Row&quot; to start.
                  </TableCell>
                </TableRow>
              )}
              {/* Section total */}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={6}>Section Total</TableCell>
                <TableCell className="text-right tabular-nums">
                  {lines
                    .reduce((sum, line) => {
                      const el = {
                        ...line,
                        section: line.section as "project" | "workflow" | "cost",
                        quantity: NUM(line.quantity),
                        items_per_object: NUM(line.items_per_object),
                        total_line_items: NUM(line.total_line_items),
                      };
                      const t = effectiveTotalLineItems(el);
                      const c = calculateLineImports(t, linesPerFile, hrsPerImport);
                      return sum + c.totalHours;
                    }, 0)
                    .toFixed(2)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
