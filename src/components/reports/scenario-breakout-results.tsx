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
  type ScenarioGroup,
  type ScopedLine,
} from "@/lib/hooks/use-scenario-breakout";
import { type MigrationBreakdownRow } from "@/lib/reports/migration-breakdown";

type ScenarioBreakoutResultsProps = {
  scenarioGroups: ScenarioGroup[];
  scopedLines: ScopedLine[];
  migrationRows: MigrationBreakdownRow[];
};

export function ScenarioBreakoutResults({
  scenarioGroups,
  scopedLines,
  migrationRows,
}: ScenarioBreakoutResultsProps) {
  return (
    <div className="space-y-6">
      {scenarioGroups.map((group) => (
        <Card key={group.scenarioType}>
          <CardHeader>
            <CardTitle className="text-base">{group.scenarioType}</CardTitle>
          </CardHeader>
          <CardContent>
            {group.lines.length === 0 ? (
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
                    {group.lines.map((line, index) => (
                      <TableRow key={`${group.scenarioType}-${index}`}>
                        <TableCell className="font-medium">
                          {line.module}
                        </TableCell>
                        <TableCell>{line.scope_selection ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(line.total_cost)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={2}>
                        {group.scenarioType} Total
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(group.totalCost)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

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
                  {scopedLines.map((line, index) => (
                    <TableRow key={`${line.service_type}-${index}`}>
                      <TableCell className="font-medium">
                        {line.service_type}
                      </TableCell>
                      <TableCell>{line.description ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(line.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={2}>Scoped Services Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(
                        scopedLines.reduce((sum, line) => sum + line.cost, 0)
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {migrationRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Migration Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Migration Service</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {migrationRows.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
