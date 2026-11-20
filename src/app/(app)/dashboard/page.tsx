export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  FileText,
  PauseCircle,
  Plus,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CountByStageChart } from "@/components/dashboard/count-by-stage-chart";
import { DashboardDateFilter } from "@/components/dashboard/dashboard-date-filter";
import {
  DashboardScopeFilter,
  type DashboardScope,
} from "@/components/dashboard/dashboard-scope-filter";
import { DashboardWidgetLink } from "@/components/dashboard/dashboard-widget-link";
import { ValueByStageChart } from "@/components/dashboard/value-by-stage-chart";
import { formatCurrency } from "@/lib/calculations/engine";
import { roundMoney } from "@/lib/calculations/rounding";
import {
  calculateClosedWonTotal,
  calculateCountByStage,
  calculateOnHoldCount,
  calculateOpenProposalValue,
  calculateQuotaProgress,
  calculateStaleCount,
  calculateValueByStage,
  calculateVarianceRollups,
  type ClosedFinancialsRow,
  type SalesOpsDashboardProposal,
} from "@/lib/dashboard/sales-ops";
import {
  buildDashboardDrillDowns,
  firstParam,
  resolveDashboardDateWindow,
  type DashboardDateWindow,
} from "@/lib/dashboard/date-window";
import { isManagerOrAdminRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { buildMigrationCostMap } from "@/lib/reports/proposal-aggregates";
import {
  fetchClosedWonFinancials,
  fetchMigrationCostInputs,
  fetchRevenueReportBaseRows,
  fetchStaleThresholds,
  fetchStatusHistoryMap,
} from "@/lib/reports/data";
import { OPEN_PROPOSAL_STATUSES } from "@/lib/proposals/status";

type DashboardSearchParams = {
  scope?: string | string[];
  range?: string | string[];
  dateFrom?: string | string[];
  dateTo?: string | string[];
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function fetchTargetAmount(
  year: number,
  scope: DashboardScope,
  userId: string | null
): Promise<number> {
  const supabase = await createClient();

  if (scope === "mine" && userId) {
    const { data, error } = await supabase
      .from("kpi_user_targets")
      .select("target_amount")
      .eq("year", year)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) {
      throw new Error(`Could not load user KPI target: ${error.message}`);
    }
    return Number(data?.target_amount) || 0;
  }

  const { data, error } = await supabase
    .from("kpi_year_targets")
    .select("team_quota")
    .eq("year", year)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not load team KPI target: ${error.message}`);
  }
  return Number(data?.team_quota) || 0;
}

function DashboardHeader({
  scopeLabel,
  dateWindow,
}: {
  scopeLabel: string;
  dateWindow: DashboardDateWindow;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Proposal Dashboard</h1>
          <Badge variant="secondary">{scopeLabel}</Badge>
          <Badge variant="outline">Closed won: {dateWindow.label}</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Open pipeline, stage mix, follow-up and on-hold counts show every open
          proposal today. Target progress counts Closed Won deals by LoE signed
          date in {dateWindow.year}, year to date. The closed-won line and price
          variance follow the selected range.
        </p>
      </div>
      <Link href="/proposals/new">
        <Button>
          <Plus className="size-4" />
          New Proposal
        </Button>
      </Link>
    </div>
  );
}

function DashboardFilters({
  scope,
  dateWindow,
}: {
  scope: DashboardScope;
  dateWindow: DashboardDateWindow;
}) {
  return (
    <Card className="rounded-lg">
      <CardContent className="space-y-4 pt-0">
        <div className="flex flex-col gap-3 pt-4 xl:flex-row xl:items-end xl:justify-between">
          <DashboardScopeFilter
            scope={scope}
            canViewTeam
            range={dateWindow.range}
            dateFrom={dateWindow.dateFrom}
            dateTo={dateWindow.dateTo}
          />
          <DashboardDateFilter
            range={dateWindow.range}
            scope={scope}
            dateFrom={dateWindow.dateFrom}
            dateTo={dateWindow.dateTo}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const dateWindow = resolveDashboardDateWindow(sp);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;
  const role = user?.app_metadata?.role;
  const defaultScope: DashboardScope = isManagerOrAdminRole(role) ? "team" : "mine";
  const requestedScope = firstParam(sp.scope);
  const scope: DashboardScope =
    requestedScope === "team" || requestedScope === "mine"
      ? requestedScope
      : defaultScope;
  const scopeLabel = scope === "mine" ? "My proposals" : "Team proposals";

  // Target progress always covers the whole target year (year to date); only
  // the closed-won line and price variance follow the selected window. Fetch
  // Closed Won once over the union of the two (YYYY-MM-DD compares as text).
  const targetYearWindow = {
    dateFrom: `${dateWindow.year}-01-01`,
    dateTo: `${dateWindow.year}-12-31`,
  };
  const selectedWindow = {
    dateFrom: dateWindow.dateFrom,
    dateTo: dateWindow.dateTo,
  };
  const closedWonFetchWindow = {
    dateFrom:
      selectedWindow.dateFrom < targetYearWindow.dateFrom
        ? selectedWindow.dateFrom
        : targetYearWindow.dateFrom,
    dateTo:
      selectedWindow.dateTo > targetYearWindow.dateTo
        ? selectedWindow.dateTo
        : targetYearWindow.dateTo,
  };
  const owner = { ownerScope: scope, currentUserId: userId ?? undefined };

  let pipelineRows: Awaited<ReturnType<typeof fetchRevenueReportBaseRows>>;
  let closedWonRows: Awaited<ReturnType<typeof fetchClosedWonFinancials>>;
  let migrationInputs: Awaited<ReturnType<typeof fetchMigrationCostInputs>>;
  let historyMetrics: Awaited<ReturnType<typeof fetchStatusHistoryMap>>;
  let thresholds: Awaited<ReturnType<typeof fetchStaleThresholds>>;
  let targetAmount: number;
  let migrationMap: Map<string, number>;

  try {
    [pipelineRows, closedWonRows, thresholds, targetAmount] = await Promise.all([
      // The pipeline is today's snapshot of every open proposal (On Hold
      // included), whatever the date window.
      fetchRevenueReportBaseRows(supabase, {
        ...owner,
        statuses: [...OPEN_PROPOSAL_STATUSES],
        orderBy: "created_at",
        ascending: false,
      }),
      // Closed revenue counts Closed Won by LoE signed date (a DATE, inclusive).
      fetchClosedWonFinancials(supabase, { ...owner, ...closedWonFetchWindow }),
      fetchStaleThresholds(supabase),
      fetchTargetAmount(dateWindow.year, scope, userId),
    ]);
    const pipelineIds = pipelineRows.map((row) => row.proposal_id);
    [migrationInputs, historyMetrics] = await Promise.all([
      fetchMigrationCostInputs(supabase, pipelineIds),
      fetchStatusHistoryMap(supabase, pipelineIds),
    ]);
    // Compute inside the try so a missing-rate throw from buildMigrationCostMap
    // surfaces in the graceful error card below, not the page error boundary.
    migrationMap =
      pipelineIds.length > 0
        ? buildMigrationCostMap(
            migrationInputs.migrationConfigRows,
            migrationInputs.migrationLineRows,
            migrationInputs.rateMap
          )
        : new Map<string, number>();
  } catch (error) {
    return (
      <div className="space-y-6">
        <DashboardHeader scopeLabel={scopeLabel} dateWindow={dateWindow} />
        <DashboardFilters scope={scope} dateWindow={dateWindow} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unable to load dashboard data</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">
              {errorMessage(error, "Dashboard data failed to load.")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pipelineProposals: SalesOpsDashboardProposal[] = pipelineRows.map((row) => {
    const metrics = historyMetrics.get(row.proposal_id);
    const value = roundMoney(
      (Number(row.p1_cost) || 0) +
        (Number(row.p2_cost) || 0) +
        (Number(row.p3_cost) || 0) +
        (Number(row.opt3_cost) || 0) +
        (Number(row.opt1_cost) || 0) +
        (Number(row.opt2_cost) || 0) +
        (Number(row.scoped_total) || 0) +
        (migrationMap.get(row.proposal_id) ?? 0)
    );

    return {
      id: row.proposal_id,
      status: row.status,
      ownerId: row.created_by,
      value,
      // A reopened deal keeps its old closeout values in the database; they
      // must not leak into the pipeline.
      soldPrice: null,
      loeValue: null,
      loeSignedDate: null,
      statusChangedAt: metrics?.lastChangedAt ?? row.created_at ?? null,
    };
  });

  const closedProposals: ClosedFinancialsRow[] = closedWonRows.map((row) => ({
    id: row.id,
    status: row.status,
    ownerId: row.created_by,
    soldPrice: row.sold_price,
    loeValue: row.loe_value,
    loeSignedDate: row.loe_signed_date,
  }));

  const openValue = calculateOpenProposalValue(pipelineProposals);
  const valueByStage = calculateValueByStage(pipelineProposals);
  const countByStage = calculateCountByStage(pipelineProposals);
  const staleCount = calculateStaleCount(pipelineProposals, {
    now: new Date(),
    thresholds,
  });
  const onHoldCount = calculateOnHoldCount(pipelineProposals);
  const quotaProgress = calculateQuotaProgress(closedProposals, {
    targetAmount,
    ...targetYearWindow,
  });
  const closedWonInWindow = calculateClosedWonTotal(closedProposals, selectedWindow);
  const varianceRollups = calculateVarianceRollups(closedProposals, selectedWindow);
  const maxStageValue = Math.max(...valueByStage.map((row) => row.value), 0);
  const maxStageCount = Math.max(...countByStage.map((row) => row.count), 0);

  // Pipeline drill-downs carry no dates. There are no closed-won links:
  // Proposal Log cannot filter by LoE signed date.
  const { openProposalHref, staleHref, onHoldHref, stageHref } =
    buildDashboardDrillDowns(scope);

  return (
    <div className="space-y-6">
      <DashboardHeader scopeLabel={scopeLabel} dateWindow={dateWindow} />

      <DashboardFilters scope={scope} dateWindow={dateWindow} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardWidgetLink
          href={openProposalHref}
          title="Blue means normal pipeline value: every open proposal, whatever the date range."
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Open proposal value</p>
                <CardTitle className="text-3xl">{formatCurrency(openValue)}</CardTitle>
              </div>
              <FileText className="mt-1 size-5 text-primary/70" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-1 text-sm font-medium text-primary">
              View open proposals <ArrowRight className="size-4" />
            </div>
          </CardContent>
        </DashboardWidgetLink>

        <DashboardWidgetLink
          href={staleHref}
          className="border-l-amber-500/65"
          title="Amber means follow-up risk. These proposals are past their stale threshold."
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Needs follow-up</p>
                <CardTitle className="text-3xl">{staleCount}</CardTitle>
              </div>
              <Clock3 className="mt-1 size-5 text-amber-600/80" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              All open proposals past their status&apos;s editable stale threshold,
              whatever the date range.
            </p>
            <div className="flex items-center gap-1 text-sm font-medium text-primary">
              View stale proposals <ArrowRight className="size-4" />
            </div>
          </CardContent>
        </DashboardWidgetLink>

        <DashboardWidgetLink
          href={onHoldHref}
          className="border-l-slate-400/80"
          title="Slate means paused work. These proposals are on hold but still visible."
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">On hold</p>
                <CardTitle className="text-3xl">{onHoldCount}</CardTitle>
              </div>
              <PauseCircle className="mt-1 size-5 text-slate-500" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Kept visible so held proposals stay owned.
            </p>
            <div className="flex items-center gap-1 text-sm font-medium text-primary">
              View on-hold proposals <ArrowRight className="size-4" />
            </div>
          </CardContent>
        </DashboardWidgetLink>

        <Card
          className="rounded-lg border-l-4 border-l-emerald-500/60"
          title={`Green means quota progress: Closed Won sold price by LoE signed date in ${dateWindow.year} (year to date).`}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  Target progress ({dateWindow.year} year to date)
                </p>
                <CardTitle className="text-3xl">
                  {quotaProgress.percentToTarget.toFixed(1)}%
                </CardTitle>
              </div>
              <Target className="mt-1 size-5 text-emerald-600/80" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-emerald-500/70"
                style={{
                  width: `${Math.min(quotaProgress.percentToTarget, 100)}%`,
                }}
              />
            </div>
            <div className="grid gap-1 text-sm text-muted-foreground">
              <span>Annual target: {formatCurrency(quotaProgress.targetAmount)}</span>
              <span>
                Annual remaining: {formatCurrency(quotaProgress.remainingToTarget)}
              </span>
              <span>
                Closed won ({dateWindow.label}): {formatCurrency(closedWonInWindow)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Value by stage</CardTitle>
          </CardHeader>
          <CardContent>
            <ValueByStageChart
              rows={valueByStage}
              maxValue={maxStageValue}
              buildStageHref={stageHref}
            />
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Count by stage</CardTitle>
          </CardHeader>
          <CardContent>
            <CountByStageChart
              rows={countByStage}
              maxCount={maxStageCount}
              buildStageHref={stageHref}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-lg">
          <CardHeader>
            <p className="text-sm text-muted-foreground">Closed price variance</p>
            <CardTitle>{formatCurrency(varianceRollups.netVariance)}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Closed Won, LoE signed {dateWindow.label}
            </p>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Over</span>
              <span>
                {varianceRollups.overCount} / {formatCurrency(varianceRollups.overVarianceTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Even</span>
              <span>{varianceRollups.evenCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Under</span>
              <span>
                {varianceRollups.underCount} / {formatCurrency(varianceRollups.underVarianceTotal)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
