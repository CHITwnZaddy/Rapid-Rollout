import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatHours } from "@/lib/calculations/engine";
import type { RolePricingBreakout } from "@/lib/calculations/contingency-pricing";
import { Badge } from "@/components/ui/badge";
import { getMarginBadgeClass } from "@/lib/ui/helpers";

type ContingencySummaryTableProps = {
  rows: RolePricingBreakout[];
  clientPrice: number;
  blendedRate?: number;
  marginPercent?: number | null;
  hideZeroRows?: boolean;
};

export function ContingencySummaryTable({
  rows,
  clientPrice,
  blendedRate,
  marginPercent,
  hideZeroRows = true,
}: ContingencySummaryTableProps) {
  const visibleRows = hideZeroRows
    ? rows.filter(
        (row) =>
          row.baseHours !== 0 ||
          row.contingencyHours !== 0 ||
          row.clientPrice !== 0
      )
    : rows;

  const totalBaseHours = visibleRows.reduce((sum, row) => sum + row.baseHours, 0);
  const totalContingencyHours = visibleRows.reduce(
    (sum, row) => sum + row.contingencyHours,
    0
  );
  const totalBaseCost = visibleRows.reduce((sum, row) => sum + row.baseCost, 0);
  const totalContingencyCost = visibleRows.reduce(
    (sum, row) => sum + row.contingencyCost,
    0
  );

  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <h3 className="mb-3 text-sm font-semibold">Cost Summary</h3>
      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Base Hrs</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Base Cost</TableHead>
              <TableHead className="text-right">Contingency Hrs</TableHead>
              <TableHead className="text-right">Contingency $</TableHead>
              <TableHead className="text-right">Client Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row.role}>
                <TableCell>{row.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatHours(row.baseHours)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.rate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.baseCost)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatHours(row.contingencyHours)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.contingencyCost)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.clientPrice)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHours(totalBaseHours)}
              </TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totalBaseCost)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHours(totalContingencyHours)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totalContingencyCost)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(clientPrice)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {(blendedRate != null || marginPercent !== undefined) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          {blendedRate != null && (
            <span>Blended Billing Rate: {formatCurrency(blendedRate)}</span>
          )}
          {marginPercent !== undefined && (
            <Badge className={getMarginBadgeClass(marginPercent ?? null)}>
              Margin:{" "}
              {marginPercent == null ? "—" : `${marginPercent.toFixed(1)}%`}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
