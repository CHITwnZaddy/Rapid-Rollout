import type { DashboardDateRange } from "@/components/dashboard/dashboard-date-filter";
import type { DashboardScope } from "@/components/dashboard/dashboard-scope-filter";
import { businessDateOf, isValidDateInput } from "@/lib/dates/business-day";

/** Raw dashboard search params that pick the date window. */
export type DashboardDateParams = {
  range?: string | string[];
  dateFrom?: string | string[];
  dateTo?: string | string[];
};

export type DashboardDateWindow = {
  range: DashboardDateRange;
  dateFrom: string;
  dateTo: string;
  label: string;
  year: number;
};

export function firstParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validDateParam(
  value: string | string[] | undefined
): string | undefined {
  const date = firstParam(value);
  return date && isValidDateInput(date) ? date : undefined;
}

/**
 * The dashboard's date window. Presets follow the Chicago calendar day, so
 * the year and quarter do not roll over early on a UTC server. Invalid custom
 * dates fall back to the current year's bounds instead of reaching the query.
 */
export function resolveDashboardDateWindow(
  params: DashboardDateParams,
  now: Date = new Date()
): DashboardDateWindow {
  const today = businessDateOf(now) ?? now.toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const q = Math.floor((month - 1) / 3);

  const requestedRange = firstParam(params.range);
  const range: DashboardDateRange =
    requestedRange === "current-quarter" || requestedRange === "custom"
      ? requestedRange
      : "current-year";

  if (range === "current-quarter") {
    return {
      range,
      dateFrom: `${year}-${String(q * 3 + 1).padStart(2, "0")}-01`,
      // Day 0 of the month after the quarter is the quarter's last day.
      dateTo: new Date(Date.UTC(year, q * 3 + 3, 0)).toISOString().slice(0, 10),
      label: `Q${q + 1} ${year}`,
      year,
    };
  }

  if (range === "custom") {
    const dateFrom = validDateParam(params.dateFrom) ?? `${year}-01-01`;
    const dateTo = validDateParam(params.dateTo) ?? `${year}-12-31`;
    return {
      range,
      dateFrom,
      dateTo,
      label: `${dateFrom} to ${dateTo}`,
      year: Number(dateFrom.slice(0, 4)),
    };
  }

  return {
    range,
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
    label: `${year}`,
    year,
  };
}

export function buildReportHref(
  pathname: string,
  params: Record<string, string | undefined>
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const queryString = query.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

/**
 * Report links for the dashboard's pipeline widgets. They carry the scope and
 * origin but not the dashboard's date window, because those widgets (open,
 * stale, on hold, by stage) show the current pipeline, not a date range.
 */
export function buildDashboardDrillDowns(scope: DashboardScope) {
  const base = { scope, from: "dashboard" };
  return {
    openProposalHref: buildReportHref("/reports/proposal-log", {
      ...base,
      status: "open",
    }),
    staleHref: buildReportHref("/reports/stale-proposals", {
      ...base,
      bucket: "stale",
    }),
    onHoldHref: buildReportHref("/reports/proposal-log", {
      ...base,
      status: "On Hold",
    }),
    stageHref: (status: string) =>
      buildReportHref("/reports/proposal-log", { ...base, status }),
  };
}
