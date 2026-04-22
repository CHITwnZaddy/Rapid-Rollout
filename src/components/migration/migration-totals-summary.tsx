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

interface MigrationTotalsSummaryProps {
  config: DbConfig | null;
  totals: MigrationTotals | null;
  srImRate: number | null;
  pmRate: number | null;
  onUpdate: (field: keyof DbConfig, value: number | boolean | string) => void;
}

export function MigrationTotalsSummary({
  config,
  totals,
  srImRate,
  pmRate,
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
                <TableCell>Project &amp; Schedule Data</TableCell>
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
                <Label className="text-xs">Sr. IM Trips</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-8"
                  value={config?.ba_trips ?? 0}
                  onChange={(e) =>
                    onUpdate("ba_trips", parseInt(e.target.value) || 0)
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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Sr. IM Factor</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  className="h-8"
                  value={config?.ba_complexity_factor ?? 1}
                  onChange={(e) =>
                    onUpdate(
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
                    onUpdate(
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
                Sr. IM Cost: {(totals?.totalBaHours ?? 0).toFixed(1)} hrs
                &times; {formatCurrency(srImRate ?? 0)}/hr
              </span>
              <span className="font-medium tabular-nums">
                {formatCurrency(totals?.baCost ?? 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>
                PM II Cost: {(totals?.totalPmHours ?? 0).toFixed(1)} hrs &times;{" "}
                {formatCurrency(pmRate ?? 0)}/hr
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
  );
}
