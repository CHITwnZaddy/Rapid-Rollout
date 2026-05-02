import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DashboardScope } from "./dashboard-scope-filter";

export type DashboardDateRange = "current-year" | "current-quarter" | "custom";

type DashboardDateFilterProps = {
  range: DashboardDateRange;
  scope: DashboardScope;
  dateFrom: string;
  dateTo: string;
};

function hrefFor(range: DashboardDateRange, scope: DashboardScope) {
  return `/dashboard?${new URLSearchParams({ scope, range }).toString()}`;
}

export function DashboardDateFilter({
  range,
  scope,
  dateFrom,
  dateTo,
}: DashboardDateFilterProps) {
  const linkClass = (value: DashboardDateRange) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      range === value
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    );

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="inline-flex w-fit rounded-lg border bg-background p-1">
        <Link href={hrefFor("current-year", scope)} className={linkClass("current-year")}>
          Current year
        </Link>
        <Link
          href={hrefFor("current-quarter", scope)}
          className={linkClass("current-quarter")}
        >
          Current quarter
        </Link>
        <span className={linkClass("custom")}>Custom range</span>
      </div>

      <form action="/dashboard" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="range" value="custom" />
        <div className="grid gap-1">
          <Label htmlFor="dashboard-date-from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="dashboard-date-from"
            name="dateFrom"
            type="date"
            defaultValue={dateFrom}
            className="h-8 w-[150px]"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="dashboard-date-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="dashboard-date-to"
            name="dateTo"
            type="date"
            defaultValue={dateTo}
            className="h-8 w-[150px]"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
      </form>
    </div>
  );
}
