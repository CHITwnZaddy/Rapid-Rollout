"use client";

import Link from "next/link";
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
import { formatDateShort } from "@/lib/reports/format";
import {
  PROPOSAL_STATUS_VARIANT,
  type ProposalStatus,
} from "@/lib/constants/statuses";
import type {
  ReportColumn,
  ReportConfig,
  ReportRowData,
} from "@/lib/reports/report-config";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Config-driven results table shared by all reports: renders columns
// by format, optional group header rows, and a totals row summing
// every column marked sum: true.
// ─────────────────────────────────────────────────────────────

function CellValue({
  column,
  row,
}: {
  column: ReportColumn;
  row: ReportRowData;
}) {
  const value = row[column.key] ?? null;

  switch (column.format) {
    case "link": {
      const id = column.hrefKey ? row[column.hrefKey] : null;
      return (
        <Link
          href={`${column.hrefBase ?? ""}/${id ?? ""}`}
          className="font-medium text-primary hover:underline"
        >
          {value ?? "—"}
        </Link>
      );
    }
    case "badge": {
      const status = String(value ?? "");
      return (
        <Badge
          variant={PROPOSAL_STATUS_VARIANT[status as ProposalStatus] ?? "secondary"}
        >
          {status || "—"}
        </Badge>
      );
    }
    case "date":
      return <>{formatDateShort(typeof value === "string" ? value : null)}</>;
    case "currency": {
      const n = Number(value) || 0;
      if (column.dashWhenZero && n === 0) return <>—</>;
      return <>{formatCurrency(n)}</>;
    }
    case "factor":
      return <>{(Number(value) || 0).toFixed(2)}</>;
    case "integer":
    case "number":
      return <>{value === null || value === "" ? "—" : value}</>;
    default:
      return <>{value ?? "—"}</>;
  }
}

function isRightAligned(format: ReportColumn["format"]): boolean {
  return (
    format === "currency" ||
    format === "factor" ||
    format === "integer" ||
    format === "number"
  );
}

export function ReportTable({
  config,
  rows,
  minWidthClass,
}: {
  config: ReportConfig;
  rows: ReportRowData[];
  minWidthClass?: string;
}) {
  const columns = config.columns;
  const hasSums = config.totalsRow && columns.some((c) => c.sum);
  const firstSumIdx = columns.findIndex((c) => c.sum);
  const labelSpan = firstSumIdx === -1 ? columns.length : firstSumIdx;

  const groups: Array<{ name: string | null; rows: ReportRowData[] }> = [];
  if (config.groupBy) {
    const map = new Map<string, ReportRowData[]>();
    rows.forEach((r) => {
      const key = String(r[config.groupBy as string] ?? "—");
      const bucket = map.get(key);
      if (bucket) bucket.push(r);
      else map.set(key, [r]);
    });
    for (const [name, groupRows] of map) groups.push({ name, rows: groupRows });
  } else {
    groups.push({ name: null, rows });
  }

  const totalsCells = (sourceRows: ReportRowData[], label: string) => (
    <TableRow className="bg-muted/50 font-semibold">
      <TableCell colSpan={labelSpan}>{label}</TableCell>
      {columns.slice(labelSpan).map((column) => (
        <TableCell key={column.key} className="text-right tabular-nums">
          {column.sum
            ? column.format === "currency"
              ? formatCurrency(
                  sourceRows.reduce(
                    (s, r) => s + (Number(r[column.key]) || 0),
                    0
                  )
                )
              : sourceRows.reduce((s, r) => s + (Number(r[column.key]) || 0), 0)
            : null}
        </TableCell>
      ))}
    </TableRow>
  );

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table className={minWidthClass}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                scope="col"
                className={cn(isRightAligned(column.format) && "text-right")}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <ReportGroup
              key={group.name ?? "__all__"}
              group={group}
              columns={columns}
              colSpan={columns.length}
              totalsRow={
                config.groupBy && hasSums && group.name !== null
                  ? totalsCells(group.rows, `${group.name} Total`)
                  : null
              }
            />
          ))}
          {hasSums ? totalsCells(rows, "Totals") : null}
        </TableBody>
      </Table>
    </div>
  );
}

function ReportGroup({
  group,
  columns,
  colSpan,
  totalsRow,
}: {
  group: { name: string | null; rows: ReportRowData[] };
  columns: ReportColumn[];
  colSpan: number;
  totalsRow: React.ReactNode;
}) {
  return (
    <>
      {group.name !== null && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={colSpan} className="font-semibold">
            {group.name}
          </TableCell>
        </TableRow>
      )}
      {group.rows.map((row, idx) => (
        <TableRow key={String(row.id ?? idx)} className="hover:bg-muted/50">
          {columns.map((column) => (
            <TableCell
              key={column.key}
              className={cn(
                isRightAligned(column.format) && "text-right tabular-nums",
                column.format === "date" && "tabular-nums text-xs",
                column.bold && "font-semibold"
              )}
            >
              <CellValue column={column} row={row} />
            </TableCell>
          ))}
        </TableRow>
      ))}
      {totalsRow}
    </>
  );
}
