import Link from "next/link";

import { cn } from "@/lib/utils";

export type DashboardScope = "mine" | "team";

type DashboardScopeFilterProps = {
  scope: DashboardScope;
  canViewTeam: boolean;
  range: string;
  dateFrom?: string;
  dateTo?: string;
};

function dashboardHref(
  scope: DashboardScope,
  range: string,
  dateFrom?: string,
  dateTo?: string
) {
  const params = new URLSearchParams({ scope, range });
  if (range === "custom") {
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
  }
  return `/dashboard?${params.toString()}`;
}

export function DashboardScopeFilter({
  scope,
  canViewTeam,
  range,
  dateFrom,
  dateTo,
}: DashboardScopeFilterProps) {
  const options: { label: string; value: DashboardScope; disabled?: boolean }[] = [
    { label: "My proposals", value: "mine" },
    { label: "Team proposals", value: "team", disabled: !canViewTeam },
  ];

  return (
    <div className="inline-flex rounded-lg border bg-background p-1">
      {options.map((option) => {
        const active = scope === option.value;
        const className = cn(
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          option.disabled && "pointer-events-none opacity-40"
        );

        if (option.disabled) {
          return (
            <span key={option.value} className={className}>
              {option.label}
            </span>
          );
        }

        return (
          <Link
            key={option.value}
            href={dashboardHref(option.value, range, dateFrom, dateTo)}
            className={className}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
