import Link from "next/link";

import { formatCurrency } from "@/lib/calculations/engine";
import type { StageValue } from "@/lib/dashboard/sales-ops";
import {
  PROPOSAL_STATUS_BAR_CLASS,
  isProposalStatus,
} from "@/lib/constants/statuses";

type ValueByStageChartProps = {
  rows: StageValue[];
  maxValue: number;
  buildStageHref: (status: string) => string;
};

export function ValueByStageChart({
  rows,
  maxValue,
  buildStageHref,
}: ValueByStageChartProps) {
  if (rows.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No open value in this range.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const width = maxValue > 0 ? Math.max((row.value / maxValue) * 100, 4) : 4;
        const barClass = isProposalStatus(row.status)
          ? PROPOSAL_STATUS_BAR_CLASS[row.status]
          : "bg-primary/60";
        return (
          <Link
            key={row.status}
            href={buildStageHref(row.status)}
            className="block rounded-md p-2 transition-colors hover:bg-muted/60"
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium">{row.status}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatCurrency(row.value)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className={`h-2 rounded-full ${barClass}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
