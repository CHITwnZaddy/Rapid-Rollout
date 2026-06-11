export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatHours } from "@/lib/calculations/engine";
import { NUM } from "@/lib/calculations/num";
import { toEngineLine } from "@/lib/calculations/adapters";
import {
  calculateMigrationTotals,
  type MigrationConfig as EngineMigrationConfig,
  type MigrationDetailLine,
} from "@/lib/calculations/migration-engine";
import { applyComplexity } from "@/lib/calculations/complexity";
import {
  allocateAdjustedTotal,
} from "@/lib/calculations/bid-sheet-pricing";
import { calculateProposalPricingSummary } from "@/lib/calculations/proposal-pricing";
import { getMarginBadgeClass } from "@/lib/ui/helpers";
import { allocateDiscountedMarginPercent } from "@/lib/calculations/contingency-pricing";
import { getScenarioDisplayName, SCENARIO_ORDER } from "@/lib/scenarios/display";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";

export default async function ProposalSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [proposalRes, scenarioRes, scopedRes, migrationConfigRes, migrationLinesRes, bidSheetRes, ratesRes] =
    await Promise.all([
      supabase
        .from("proposals")
        .select(
          "created_at, status, sold_price, loe_value, loe_signed_date, variance_reason_code, variance_note, closed_lost_reason, closed_lost_note, closed_financials_corrected_at, scoped_complexity_factor"
        )
        .eq("id", id)
        .single(),
      supabase
        .from("scenarios")
        .select(
          "scenario_type, summary_total_hours, summary_total_cost, complexity_factor"
        )
        .eq("proposal_id", id)
        .order("scenario_type"),
      supabase
        .from("scoped_services")
        .select("cost, hours")
        .eq("proposal_id", id),
      supabase
        .from("migration_config")
        .select(
          "num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, complexity_factor, sr_im_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs"
        )
        .eq("proposal_id", id)
        .single(),
      supabase
        .from("migration_detail_lines")
        .select("id, section, label, quantity, items_per_object, total_line_items, row_order")
        .eq("proposal_id", id)
        .order("row_order"),
      supabase
        .from("bid_sheets")
        .select("discount_percent, discount_dollars")
        .eq("proposal_id", id)
        .single(),
      supabase
        .from("rate_cards")
        .select("lookup_key, rate")
        .in("lookup_key", [
          INTERNAL_COST_RATE_KEY,
          SR_IM_RATE_KEY,
          PM_RATE_KEY,
          TRAVEL_RATE_KEY,
        ]),
    ]);

  // Per-query error checks: a failed scenarios query previously fell
  // through to the generic "Unable to load pricing data" rates error,
  // which pointed debugging at the wrong table. Name the query that
  // actually failed. (migration_config and bid_sheets use .single() and
  // are intentionally tolerated when absent — handled below.)
  if (proposalRes.error || !proposalRes.data) notFound();
  const failedQuery = scenarioRes.error
    ? "scenarios"
    : scopedRes.error
      ? "scoped services"
      : migrationLinesRes.error
        ? "migration detail lines"
        : null;
  if (failedQuery) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unable to load proposal data</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            The {failedQuery} for this proposal could not be read. Refresh
            the page to retry; if the problem persists, contact an admin.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rateRows = ratesRes.data ?? [];
  const internalCostRateRow = rateRows.find(
    (r) => r.lookup_key === INTERNAL_COST_RATE_KEY
  );

  // Fail closed: margins are pricing-critical. If we can't read the
  // burden rate or internal cost rate, refuse to render margins
  // rather than silently use a stale default. See migrations 007 and
  // 022 for the seed rows.
  if (ratesRes.error || !internalCostRateRow) {
    const missing = [
      !internalCostRateRow ? INTERNAL_COST_RATE_KEY : null,
    ].filter(Boolean) as string[];
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unable to load pricing data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            One or more pricing-critical rate card rows could not be read
            from <code>rate_cards</code>:{" "}
            {missing.map((k, i) => (
              <span key={k}>
                {i > 0 ? ", " : ""}
                <code>{k}</code>
              </span>
            ))}
            . Margin calculations depend on these values, so the proposal
            summary has been blocked to prevent incorrect pricing being
            shown.
          </p>
          <p>
            Refresh the page to retry. If the problem persists, an admin should
            verify the missing row(s) exist in the rate card table.
          </p>
        </CardContent>
      </Card>
    );
  }
  const internalCostRate = Number(internalCostRateRow.rate);

  const srImRateRow = rateRows.find((r) => r.lookup_key === SR_IM_RATE_KEY);
  const pmRateRow = rateRows.find((r) => r.lookup_key === PM_RATE_KEY);
  const travelRateRow = rateRows.find((r) => r.lookup_key === TRAVEL_RATE_KEY);
  const srImRate = srImRateRow ? Number(srImRateRow.rate) : null;
  const pmRate = pmRateRow ? Number(pmRateRow.rate) : null;
  const travelRate = travelRateRow ? Number(travelRateRow.rate) : null;

  const scenarios = scenarioRes.data;
  if (!scenarios) notFound();

  const scopedComplexityFactor =
    Number(proposalRes.data?.scoped_complexity_factor) || 1;
  const proposal = proposalRes.data;
  const isClosed =
    proposal?.status === "Closed Won" || proposal?.status === "Closed Lost";
  const varianceAmount =
    proposal?.sold_price != null && proposal?.loe_value != null
      ? Number(proposal.loe_value) - Number(proposal.sold_price)
      : null;
  const formatDate = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleDateString() : "—";

  const scopedRawTotal = (scopedRes.data ?? []).reduce(
    (sum, s) => sum + Number(s.cost),
    0
  );
  const scopedBaseHours = (scopedRes.data ?? []).reduce(
    (sum, s) => sum + Number(s.hours),
    0
  );
  const scopedTotal = applyComplexity(scopedRawTotal, scopedComplexityFactor);
  const scopedTotalHours = applyComplexity(scopedBaseHours, scopedComplexityFactor);
  const scopedInternalCost = scopedBaseHours * internalCostRate;

  // Compute migration total live from the same inputs the Migration
  // Services page uses, instead of trusting the stored
  // computed_total_cost snapshot (which only updates when the migration
  // page's debounced save fires and can lag or be zero on new proposals).
  const migCfg = migrationConfigRes.data;
  const migLines = migrationLinesRes.data ?? [];
  let migrationTotal = 0;
  let migrationTotalHours = 0;
  let migrationInternalCost = 0;
  if (migCfg) {
    // Fail closed on missing Sr. IM/PM/Travel rates. Previously the page
    // silently rendered migrationTotal = 0, which is how the Sr. IM
    // bug class (missing lookup_key → $0 cost) stayed invisible.
    if (srImRate === null || pmRate === null || travelRate === null) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Unable to load pricing data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              One or more required rate card rows are missing:
              <code>{SR_IM_RATE_KEY}</code>, <code>{PM_RATE_KEY}</code>, or{" "}
              <code>{TRAVEL_RATE_KEY}</code>. The migration total
              depends on these, so the proposal summary has been blocked
              to prevent incorrect pricing being shown.
            </p>
            <p>
              An admin should seed these rows in the rate card table.
            </p>
          </CardContent>
        </Card>
      );
    }
    const numP = NUM(migCfg.num_projects);
    const engineCfg: EngineMigrationConfig = {
      num_projects: numP,
      hrs_per_import: NUM(migCfg.hrs_per_import),
      lines_per_import_file: NUM(migCfg.lines_per_import_file),
      is_effort_included: migCfg.is_effort_included ?? false,
      is_workshop_included: migCfg.is_workshop_included ?? false,
      complexity_factor: NUM(migCfg.complexity_factor),
      sr_im_trips: NUM(migCfg.sr_im_trips),
      pm_trips: NUM(migCfg.pm_trips),
      doc_avg_mb_per_project: NUM(migCfg.doc_avg_mb_per_project),
      doc_mb_per_hour: NUM(migCfg.doc_mb_per_hour),
      core_requirements_hrs: NUM(migCfg.core_requirements_hrs),
      core_migration_plan_hrs: NUM(migCfg.core_migration_plan_hrs),
      core_validation_hrs: NUM(migCfg.core_validation_hrs),
      core_final_qa_hrs: NUM(migCfg.core_final_qa_hrs),
      core_pm_oversight_hrs: NUM(migCfg.core_pm_oversight_hrs),
    };
    const projectLines: MigrationDetailLine[] = migLines
      .filter((l) => l.section === "project")
      .map((l) => toEngineLine(l, { quantityOverride: numP }));
    const workflowLines: MigrationDetailLine[] = migLines
      .filter((l) => l.section === "workflow")
      .map((l) => toEngineLine(l));
    const costLines: MigrationDetailLine[] = migLines
      .filter((l) => l.section === "cost")
      .map((l) => toEngineLine(l));
    const migrationTotals = calculateMigrationTotals(
      engineCfg,
      projectLines,
      workflowLines,
      costLines,
      srImRate,
      pmRate,
      travelRate,
      internalCostRate
    );
    migrationTotal = migrationTotals.clientPrice;
    migrationTotalHours = migrationTotals.totalSrImHours + migrationTotals.totalPmHours;
    migrationInternalCost = migrationTotals.internalCost;
  }

  const discountPercent = Number(bidSheetRes.data?.discount_percent) || 0;
  const discountDollars = Number(bidSheetRes.data?.discount_dollars) || 0;

  const scenarioRows = SCENARIO_ORDER
    .map((type) => scenarios.find((s) => s.scenario_type === type))
    .filter(Boolean);

  const { proposalSubtotal, pricing } = calculateProposalPricingSummary({
    scenarios: scenarioRows.map((scenario) => ({
      summary_total_cost: scenario!.summary_total_cost,
      summary_total_hours: scenario!.summary_total_hours,
      complexity_factor: scenario!.complexity_factor,
    })),
    migrationTotal,
    scopedTotal,
    credit: discountDollars,
    discountPercent,
  });

  const allocated = scenarioRows.map((s) => {
    const cf = Number(s!.complexity_factor ?? 1);
    const baseHours = Number(s!.summary_total_hours);
    const totalCost = applyComplexity(Number(s!.summary_total_cost), cf);
    const totalHours = applyComplexity(baseHours, cf);
    const internalCost = baseHours * internalCostRate;
    const discountedCost = allocateAdjustedTotal(
      totalCost,
      proposalSubtotal,
      pricing.finalTotal
    );
    const marginPercent = allocateDiscountedMarginPercent(
      discountedCost,
      internalCost
    );

    return {
      scenarioType: s!.scenario_type,
      totalHours,
      totalCost,
      discountedCost,
      marginPercent,
      status: totalCost > 0 ? "Configured" : "Empty",
    };
  });

  const scopedDiscountedCost = allocateAdjustedTotal(
    scopedTotal,
    proposalSubtotal,
    pricing.finalTotal
  );
  const migrationDiscountedCost = allocateAdjustedTotal(
    migrationTotal,
    proposalSubtotal,
    pricing.finalTotal
  );
  const scopedMargin = allocateDiscountedMarginPercent(
    scopedDiscountedCost,
    scopedInternalCost
  );
  const migrationMargin = allocateDiscountedMarginPercent(
    migrationDiscountedCost,
    migrationInternalCost
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Proposal Facts</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Created Date</dt>
              <dd className="font-medium">{formatDate(proposal?.created_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">{proposal?.status ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sold Price</dt>
              <dd className="font-medium">
                {proposal?.sold_price == null
                  ? "—"
                  : formatCurrency(Number(proposal.sold_price))}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Signed LoE Value</dt>
              <dd className="font-medium">
                {proposal?.loe_value == null
                  ? "—"
                  : formatCurrency(Number(proposal.loe_value))}
              </dd>
            </div>
            {isClosed && (
              <>
                <div>
                  <dt className="text-muted-foreground">LoE Signed Date</dt>
                  <dd className="font-medium">
                    {formatDate(proposal?.loe_signed_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Variance</dt>
                  <dd className="font-medium">
                    {varianceAmount == null ? "—" : formatCurrency(varianceAmount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Variance Reason</dt>
                  <dd className="font-medium">
                    {proposal?.variance_reason_code ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Correction</dt>
                  <dd className="font-medium">
                    {formatDate(proposal?.closed_financials_corrected_at)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Variance Note</dt>
                  <dd className="font-medium">{proposal?.variance_note ?? "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Closed Lost Details</dt>
                  <dd className="font-medium">
                    {proposal?.closed_lost_reason
                      ? `${proposal.closed_lost_reason}: ${proposal.closed_lost_note ?? ""}`
                      : "—"}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Scenario Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line Item</TableHead>
                <TableHead className="text-right">Total Hours</TableHead>
                <TableHead className="text-right">Discounted Cost</TableHead>
                <TableHead className="text-right">Client Price</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocated.map((s) => (
                <TableRow key={s.scenarioType} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    <Link
                      href={`/proposals/${id}/scenarios/${s.scenarioType}`}
                      className="text-primary hover:underline"
                    >
                      {getScenarioDisplayName(s.scenarioType)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatHours(s.totalHours)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(s.discountedCost)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(s.totalCost)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge className={getMarginBadgeClass(s.marginPercent)}>
                      {s.marginPercent === null
                        ? "—"
                        : `${s.marginPercent.toFixed(2)}%`}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {s.status === "Configured" ? (
                      <Badge variant="default">Configured</Badge>
                    ) : (
                      <Badge variant="secondary">Empty</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              <TableRow className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  <Link
                    href={`/proposals/${id}/scoped-services`}
                    className="text-primary hover:underline"
                  >
                    Scoped Services
                  </Link>
                </TableCell>
                <TableCell className="text-right">{formatHours(scopedTotalHours)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(scopedDiscountedCost)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(scopedTotal)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge className={getMarginBadgeClass(scopedMargin)}>
                    {scopedMargin === null ? "—" : `${scopedMargin.toFixed(2)}%`}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {scopedTotal > 0 ? (
                    <Badge variant="default">Configured</Badge>
                  ) : (
                    <Badge variant="secondary">Empty</Badge>
                  )}
                </TableCell>
              </TableRow>

              <TableRow className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  <Link
                    href={`/proposals/${id}/migration`}
                    className="text-primary hover:underline"
                  >
                    Migration Services
                  </Link>
                </TableCell>
                <TableCell className="text-right">{formatHours(migrationTotalHours)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(migrationDiscountedCost)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(migrationTotal)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge className={getMarginBadgeClass(migrationMargin)}>
                    {migrationMargin === null
                      ? "—"
                      : `${migrationMargin.toFixed(2)}%`}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {migrationTotal > 0 ? (
                    <Badge variant="default">Configured</Badge>
                  ) : (
                    <Badge variant="secondary">Empty</Badge>
                  )}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
