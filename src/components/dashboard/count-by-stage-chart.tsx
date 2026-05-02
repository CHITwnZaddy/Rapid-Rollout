import Link from "next/link";

import { cn } from "@/lib/utils";
import type { StageCount } from "@/lib/dashboard/sales-ops";

type CountByStageChartProps = {
  rows: StageCount[];
  maxCount: number;
  buildStageHref: (status: string) => string;
};

export function CountByStageChart({
  rows,
  maxCount,
  buildStageHref,
}: CountByStageChartProps) {
  if (rows.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No open proposals in this range.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const width = maxCount > 0 ? Math.max((row.count / maxCount) * 100, 6) : 6;
        return (
          <Link
            key={row.status}
            href={buildStageHref(row.status)}
            className="block rounded-md p-2 transition-colors hover:bg-muted/60"
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium">{row.status}</span>
              <span className="shrink-0 text-muted-foreground">
                {row.count} {row.count === 1 ? "proposal" : "proposals"}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className={cn(
                  "h-2 rounded-full",
                  index % 4 === 0 && "bg-violet-500/65",
                  index % 4 === 1 && "bg-cyan-500/65",
                  index % 4 === 2 && "bg-emerald-500/65",
                  index % 4 === 3 && "bg-rose-500/60"
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
