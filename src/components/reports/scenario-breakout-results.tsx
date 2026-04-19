"use client";

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
  computeLineHours,
  calculateDocumentHours,
  type MigrationDetailLine,
} from "@/lib/calculations/migration-engine";
import {
  type ScenarioGroup,
  type ScopedLine,
  type MigrationConfig,
  type MigrationLine,
} from "@/lib/hooks/use-scenario-breakout";
import { NUM } from "@/lib/calculations/num";

interface ScenarioBreakoutResultsProps {
  scenarioGroups: ScenarioGroup[];
  scopedLines: ScopedLine[];
  migrationConfig: MigrationConfig | null;
  migrationLines: MigrationLine[];
  baRate: number | null;
  pmRate: number | null;
  migrationLiveTotal: number;
  coreEffortHours: number;
}

export function ScenarioBreakoutResults({
  scenarioGroups,
  scopedLines,
  migrationConfig,
  migrationLines,
  baRate,
  pmRate,
  migrationLiveTotal,
  coreEffortHours,
}: ScenarioBreakoutResultsProps) {
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
      const calc = computeLineHours(el, {
        lines_per_import_file: NUM(migrationConfig.lines_per_import_file),
        hrs_per_import: NUM(migrationConfig.hrs_per_import),
      });
      return sum + calc.totalHours;
    }, 0);
  }

  function migSectionCost(hours: number): number {
    if (baRate == null) return 0;
    return hours * NUM(migrationConfig?.ba_complexity_factor) * baRate;
  }

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

  return (
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
                        const c = computeLineHours(el, {
                          lines_per_import_file: NUM(migrationConfig.lines_per_import_file),
                          hrs_per_import: NUM(migrationConfig.hrs_per_import),
                        });
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
                        const c = computeLineHours(el, {
                          lines_per_import_file: NUM(migrationConfig.lines_per_import_file),
                          hrs_per_import: NUM(migrationConfig.hrs_per_import),
                        });
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
                        const c = computeLineHours(el, {
                          lines_per_import_file: NUM(migrationConfig.lines_per_import_file),
                          hrs_per_import: NUM(migrationConfig.hrs_per_import),
                        });
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

            {/* Migration Grand Total — computed live from the same
                section data shown above so it always cascades. */}
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex justify-between text-base font-bold">
                <span>Migration Services Total</span>
                <span className="tabular-nums">
                  {formatCurrency(migrationLiveTotal)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
