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
import {
  DashboardDateFilter,
  type DashboardDateRange,
} from "@/components/dashboard/dashboard-date-filter";
import {
  DashboardScopeFilter,
  type DashboardScope,
} from "@/components/dashboard/dashboard-scope-filter";
import { DashboardWidgetLink } from "@/components/dashboard/dashboard-widget-link";
import { ValueByStageChart } from "@/components/dashboard/value-by-stage-chart";
import { formatCurrency } from "@/lib/calculations/engine";
import {
  calculateCountByStage,
  calculateOnHoldCount,
  calculateOpenProposalValue,
  calculateQuotaProgress,
  calculateStaleCount,
  calculateValueByStage,
  calculateVarianceRollups,
  type SalesOpsDashboardProposal,
} from "@/lib/dashboard/sales-ops";
import { isManagerOrAdminRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { buildMigrationCostMap } from "@/lib/reports/proposal-aggregates";
import {
  fetchMigrationCostInputs,
  fetchRevenueReportBaseRows,
  fetchStatusHistoryMap,
} from "@/lib/reports/data";
import type { StaleTrackedStatus } from "@/lib/proposals/status";

type DashboardSearchParams = {
  scope?: string | string[];
  range?: string | string[];
  dateFrom?: string | string[];
  dateTo?: string | string[];
};

type CloseoutFinancialRow = {
  id: string;
  sold_price: number | null;
  loe_value: number | null;
  loe_signed_date: string | null;
};

type StaleThresholdRow = {
  status: string;
  threshold_days: number;
};

type DashboardDateWindow = {
  range: DashboardDateRange;
  dateFrom: string;
  dateTo: string;
  label: string;
  year: number;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfQuarter(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1);
}

function endOfQuarter(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth + 3, 0);
}

function resolveDateWindow(searchParams: DashboardSearchParams): DashboardDateWindow {
  const now = new Date();
  const requestedRange = firstParam(searchParams.range);
  const range: DashboardDateRange =
    requestedRange === "current-quarter" || requestedRange === "custom"
      ? requestedRange
      : "current-year";

  if (range === "current-quarter") {
    const dateFrom = toDateInput(startOfQuarter(now));
    const dateTo = toDateInput(endOfQuarter(now));
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return {
      range,
      dateFrom,
      dateTo,
      label: `Q${quarter} ${now.getFullYear()}`,
      year: now.getFullYear(),
    };
  }

  if (range === "custom") {
    const fallbackFrom = `${now.getFullYear()}-01-01`;
    const fallbackTo = `${now.getFullYear()}-12-31`;
    const dateFrom = firstParam(searchParams.dateFrom) || fallbackFrom;
    const dateTo = firstParam(searchParams.dateTo) || fallbackTo;
    return {
      range,
      dateFrom,
      dateTo,
      label: `${dateFrom} to ${dateTo}`,
      year: Number(dateFrom.slice(0, 4)) || now.getFullYear(),
    };
  }

  return {
    range,
    dateFrom: `${now.getFullYear()}-01-01`,
    dateTo: `${now.getFullYear()}-12-31`,
    label: `${now.getFullYear()}`,
    year: now.getFullYear(),
  };
}

function buildReportHref(
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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

async function fetchCloseoutFinancials(
  proposalIds: string[]
): Promise<Map<string, CloseoutFinancialRow>> {
  if (proposalIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase
    .from("proposals")
    .select("id, sold_price, loe_value, loe_signed_date")
    .in("id", proposalIds);

  return new Map(
    ((data ?? []) as CloseoutFinancialRow[]).map((row) => [row.id, row])
  );
}

async function fetchStaleThresholds(): Promise<
  Partial<Record<StaleTrackedStatus, number>>
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proposal_stale_thresholds")
    .select("status, threshold_days")
    .eq("is_active", true);

  return ((data ?? []) as StaleThresholdRow[]).reduce<
    Partial<Record<StaleTrackedStatus, number>>
  >((thresholds, row) => {
    thresholds[row.status as StaleTrackedStatus] = row.threshold_days;
    return thresholds;
  }, {});
}

async function fetchTargetAmount(
  year: number,
  scope: DashboardScope,
  userId: string | null
): Promise<number> {
  const supabase = await createClient();

  if (scope === "mine" && userId) {
    const { data } = await supabase
      .from("kpi_user_targets")
      .select("target_amount")
      .eq("year", year)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    return Number(data?.target_amount) || 0;
  }

  const { data } = await supabase
    .from("kpi_year_targets")
    .select("team_quota")
    .eq("year", year)
    .eq("is_active", true)
    .maybeSingle();
  return Number(data?.team_quota) || 0;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const dateWindow = resolveDateWindow(sp);
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

  const proposals = await fetchRevenueReportBaseRows(supabase, {
    ownerScope: scope,
    currentUserId: userId ?? undefined,
    dateColumn: "created_at",
    dateFrom: dateWindow.dateFrom,
    dateTo: dateWindow.dateTo,
    orderBy: "created_at",
    ascending: false,
  });
  const proposalIds = proposals.map((proposal) => proposal.proposal_id);
  const [migrationInputs, historyMetrics, closeoutMap, thresholds, targetAmount] =
    await Promise.all([
      fetchMigrationCostInputs(supabase, proposalIds),
      fetchStatusHistoryMap(supabase, proposalIds),
      fetchCloseoutFinancials(proposalIds),
      fetchStaleThresholds(),
      fetchTargetAmount(dateWindow.year, scope, userId),
    ]);

  const migrationMap =
    proposalIds.length > 0
      ? buildMigrationCostMap(
          migrationInputs.migrationConfigRows,
          migrationInputs.migrationLineRows,
          migrationInputs.rateMap
        )
      : new Map<string, number>();

  const dashboardProposals: SalesOpsDashboardProposal[] = proposals.map((proposal) => {
    const closeout = closeoutMap.get(proposal.proposal_id);
    const metrics = historyMetrics.get(proposal.proposal_id);
    const value = roundMoney(
      (Number(proposal.p1_cost) || 0) +
        (Number(proposal.p2_cost) || 0) +
        (Number(proposal.p3_cost) || 0) +
        (Number(proposal.p4_cost) || 0) +
        (Number(proposal.opt1_cost) || 0) +
        (Number(proposal.opt2_cost) || 0) +
        (Number(proposal.scoped_total) || 0) +
        (migrationMap.get(proposal.proposal_id) ?? 0)
    );

    return {
      id: proposal.proposal_id,
      status: proposal.status,
      ownerId: proposal.created_by,
      value,
      soldPrice: closeout?.sold_price ?? null,
      loeValue: closeout?.loe_value ?? null,
      loeSignedDate: closeout?.loe_signed_date ?? null,
      statusChangedAt: metrics?.lastChangedAt ?? proposal.created_at ?? null,
    };
  });

  const openValue = calculateOpenProposalValue(dashboardProposals);
  const valueByStage = calculateValueByStage(dashboardProposals);
  const countByStage = calculateCountByStage(dashboardProposals);
  const staleCount = calculateStaleCount(dashboardProposals, {
    now: new Date(),
    thresholds,
  });
  const onHoldCount = calculateOnHoldCount(dashboardProposals);
  const quotaProgress = calculateQuotaProgress(dashboardProposals, {
    targetAmount,
    dateFrom: dateWindow.dateFrom,
    dateTo: dateWindow.dateTo,
  });
  const varianceRollups = calculateVarianceRollups(dashboardProposals);
  const maxStageValue = Math.max(...valueByStage.map((row) => row.value), 0);
  const maxStageCount = Math.max(...countByStage.map((row) => row.count), 0);
  const scopeLabel = scope === "mine" ? "My proposals" : "Team proposals";

  const proposalLogParams = {
    scope,
    from: "dashboard",
    range: dateWindow.range,
    dateFrom: dateWindow.dateFrom,
    dateTo: dateWindow.dateTo,
  };
  const openProposalHref = buildReportHref("/reports/proposal-log", {
    ...proposalLogParams,
    status: "open",
  });
  const staleHref = buildReportHref("/reports/stale-proposals", {
    scope,
    from: "dashboard",
    range: dateWindow.range,
    dateFrom: dateWindow.dateFrom,
    dateTo: dateWindow.dateTo,
    bucket: "stale",
  });
  const onHoldHref = buildReportHref("/reports/proposal-log", {
    ...proposalLogParams,
    status: "On Hold",
  });
  const stageHref = (status: string) =>
    buildReportHref("/reports/proposal-log", {
      ...proposalLogParams,
      status,
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">Proposal Dashboard</h1>
            <Badge variant="secondary">{scopeLabel}</Badge>
            <Badge variant="outline">{dateWindow.label}</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Pipeline value, stage mix, stale work, and closed revenue for the selected view.
          </p>
        </div>
        <Link href="/proposals/new">
          <Button>
            <Plus className="size-4" />
            New Proposal
          </Button>
        </Link>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardWidgetLink
          href={openProposalHref}
          title="Blue means normal pipeline value. The value comes from open proposal totals."
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
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Closed sold in range</span>
              <span>{formatCurrency(quotaProgress.closedSoldPrice)}</span>
            </div>
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
              Based on days in current status and editable stale thresholds.
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
          title="Green means quota progress. This uses closed sold value in the selected range."
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Target progress</p>
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
