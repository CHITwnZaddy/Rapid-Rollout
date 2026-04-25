"use client";

import { Input } from "@/components/ui/input";
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
import { type DbConfig } from "@/lib/hooks/use-migration-config";
import { type MigrationTotals } from "@/lib/calculations/migration-engine";
import { ContingencySummaryTable } from "@/components/pricing/contingency-summary-table";

type MigrationTotalsSummaryProps = {
  config: DbConfig | null;
  totals: MigrationTotals | null;
  onUpdate: (field: keyof DbConfig, value: number | boolean | string) => void;
};

export function MigrationTotalsSummary({
  config,
  totals,
  onUpdate,
}: MigrationTotalsSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Services &amp; Hours Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hours breakdown */}
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead className="text-right">Sr. IM Hours</TableHead>
                <TableHead className="text-right">PM II Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config?.is_workshop_included && (
                <TableRow>
                  <TableCell>Data Migration Workshop</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totals?.workshopSrIm ?? 0).toFixed(1)}
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
                    {(totals?.coreSrIm ?? 0).toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(totals?.corePm ?? 0).toFixed(1)}
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell>Project &amp; Schedule Data</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(totals?.projectSrIm ?? 0).toFixed(1)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Workflow Data</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(totals?.workflowSrIm ?? 0).toFixed(1)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Cost Data</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(totals?.costSrIm ?? 0).toFixed(1)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Document Data</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(totals?.documentSrIm ?? 0).toFixed(1)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Travel</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(totals?.travelSrIm ?? 0).toFixed(1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {(totals?.travelPm ?? 0).toFixed(1)}
                </TableCell>
              </TableRow>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Total Hours</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(totals?.totalSrImHours ?? 0).toFixed(1)}
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
                <Label className="text-xs">Sr. IM Trips</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-8"
                  value={config?.sr_im_trips ?? 0}
                  onChange={(e) =>
                    onUpdate("sr_im_trips", parseInt(e.target.value) || 0)
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
                    onUpdate("pm_trips", parseInt(e.target.value) || 0)
                  }
                />
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Estimated T&amp;E: {formatCurrency(totals?.travelExpense ?? 0)}
            </p>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium">
              Complexity Factor
            </h4>
            <div className="space-y-1">
              <Label className="text-xs">Complexity Factor</Label>
              <Input
                type="number"
                min={0.5}
                max={9.99}
                step={0.01}
                className="h-8"
                value={config?.complexity_factor ?? 1}
                onChange={(e) =>
                  onUpdate("complexity_factor", parseFloat(e.target.value) || 1)
                }
              />
            </div>
          </div>
        </div>

        {/* Cost Summary */}
        <ContingencySummaryTable
          rows={totals?.roleBreakouts ?? []}
          clientPrice={totals?.clientPrice ?? 0}
          blendedRate={totals?.blendedRate ?? 0}
          marginPercent={totals?.marginPercent ?? null}
        />
        <div className="text-sm text-muted-foreground">
          T&amp;E Estimate: {formatCurrency(totals?.travelExpense ?? 0)}
        </div>
      </CardContent>
    </Card>
  );
}
