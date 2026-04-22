"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import {
  computeLineHours,
  type MigrationDetailLine,
} from "@/lib/calculations/migration-engine";
import { NUM } from "@/lib/calculations/num";

/**
 * Shared row shape for the Project / Workflow / Cost migration tables.
 * Kept local to this module so the migration page can stay free of the
 * "DbLine" type leakage while still reusing the component.
 */
export interface MigrationSectionRow {
  id: string;
  section: string;
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
  row_order: number;
}

export interface MigrationSectionConfig {
  hrs_per_import: number;
  lines_per_import_file: number;
}

export interface MigrationDetailSectionProps<T extends MigrationSectionRow> {
  title: string;
  section: "project" | "workflow" | "cost";
  lines: T[];
  config: MigrationSectionConfig | null;
  /** When provided, overrides per-row quantity (used by the project section
   *  to drive quantity from the global num_projects config). */
  numProjectsOverride?: number;
  complexityFactor?: number;
  qtyLabel: string;
  itemsLabel: string;
  totalEditable: boolean;
  /**
   * Whether the label cell is editable. Pass a boolean for a uniform
   * rule, or a predicate for per-row control (e.g. lock the original
   * Project & Schedule rows but allow editing labels on user-added rows).
   */
  labelEditable?: boolean | ((row: T) => boolean);
  onUpdateLine: (
    id: string,
    field: "label" | "quantity" | "items_per_object" | "total_line_items",
    value: string | number
  ) => void;
  onAddLine: (section: "project" | "workflow" | "cost") => void;
  onRemoveLine: (id: string) => void;
}

export function MigrationDetailSection<T extends MigrationSectionRow>({
  title,
  section,
  lines,
  config,
  numProjectsOverride,
  complexityFactor = 1,
  qtyLabel,
  itemsLabel,
  totalEditable,
  labelEditable,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
}: MigrationDetailSectionProps<T>) {
  const hrsPerImport = NUM(config?.hrs_per_import);
  const linesPerFile = NUM(config?.lines_per_import_file);
  const adjustedHrsPerImport = hrsPerImport * complexityFactor;

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
                const qty =
                  numProjectsOverride !== undefined
                    ? numProjectsOverride
                    : NUM(line.quantity);
                const itemsPer = NUM(line.items_per_object);

                const engineLine: MigrationDetailLine = {
                  id: line.id,
                  section: line.section as "project" | "workflow" | "cost",
                  label: line.label,
                  quantity: qty,
                  items_per_object: itemsPer,
                  total_line_items: NUM(line.total_line_items),
                  row_order: line.row_order,
                };
                const calc = computeLineHours(engineLine, {
                  lines_per_import_file: linesPerFile,
                  hrs_per_import: hrsPerImport,
                });
                const adjustedTotalHours = calc.totalHours * complexityFactor;
                const isLabelEditable =
                  typeof labelEditable === "function"
                    ? labelEditable(line)
                    : !!labelEditable;
                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      {isLabelEditable ? (
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
                      {numProjectsOverride !== undefined ? (
                        <div className="text-right text-sm tabular-nums">
                          {numProjectsOverride}
                        </div>
                      ) : (
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
                      )}
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
                          {calc.totalLineItems.toLocaleString()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {calc.numImports}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {adjustedHrsPerImport.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {adjustedTotalHours.toFixed(2)}
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
                      const qty =
                        numProjectsOverride !== undefined
                          ? numProjectsOverride
                          : NUM(line.quantity);
                      const el: MigrationDetailLine = {
                        id: line.id,
                        section: line.section as
                          | "project"
                          | "workflow"
                          | "cost",
                        label: line.label,
                        quantity: qty,
                        items_per_object: NUM(line.items_per_object),
                        total_line_items: NUM(line.total_line_items),
                        row_order: line.row_order,
                      };
                      const c = computeLineHours(el, {
                        lines_per_import_file: linesPerFile,
                        hrs_per_import: hrsPerImport,
                      });
                      return sum + c.totalHours * complexityFactor;
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
