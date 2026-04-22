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

function calcMarginPercent(
  discountedCost: number,
  totalHours: number,
  burdenRate: number
): number | null {
  if (totalHours <= 0 || discountedCost <= 0) return null;
  const effectiveSellRate = discountedCost / totalHours;
  if (effectiveSellRate <= 0) return null;
  return ((effectiveSellRate - burdenRate) / effectiveSellRate) * 100;
}

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
        .select("scoped_complexity_factor")
        .eq("id", id)
        .single(),
      supabase
        .from("scenarios")
        .select(
          "scenario_type, summary_total_hours, summary_total_cost, is_active, complexity_factor"
        )
        .eq("proposal_id", id)
        .order("scenario_type"),
      supabase
        .from("scoped_services")
        .select("cost")
        .eq("proposal_id", id),
      supabase
        .from("migration_config")
        .select(
          "num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, ba_complexity_factor, pm_complexity_factor, ba_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs"
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
          "Master|Burden Rate",
          "Master|Business Analyst",
          "Master|Program Manager",
          "Master|Travel Cost/Trip",
        ]),
    ]);

  const rateRows = ratesRes.data ?? [];
  const burdenRateRow = rateRows.find((r) => r.lookup_key === "Master|Burden Rate");

  // Fail closed: margins are pricing-critical. If we can't read the
  // burden rate, refuse to render margins rather than silently use a
  // stale default. See migration 007 for the seed row.
  if (ratesRes.error || !burdenRateRow) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unable to load pricing data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            The burden rate (<code>Master|Burden Rate</code>) could not be read
            from <code>rate_cards</code>. Margin calculations depend on this
            value, so the proposal summary has been blocked to prevent
            incorrect pricing being shown.
          </p>
          <p>
            Refresh the page to retry. If the problem persists, an admin should
            verify the <code>Master|Burden Rate</code> row exists in the rate
            card table.
          </p>
        </CardContent>
      </Card>
    );
  }
  const burdenRate = Number(burdenRateRow.rate);

  const baRateRow = rateRows.find((r) => r.lookup_key === "Master|Business Analyst");
  const pmRateRow = rateRows.find((r) => r.lookup_key === "Master|Program Manager");
  const travelRateRow = rateRows.find((r) => r.lookup_key === "Master|Travel Cost/Trip");
  const baRate = baRateRow ? Number(baRateRow.rate) : null;
  const pmRate = pmRateRow ? Number(pmRateRow.rate) : null;
  const travelRate = travelRateRow ? Number(travelRateRow.rate) : null;

  const scenarios = scenarioRes.data;
  if (!scenarios) notFound();

  const scopedComplexityFactor =
    Number(proposalRes.data?.scoped_complexity_factor) || 1;

  const scopedRawTotal = (scopedRes.data ?? []).reduce(
    (sum, s) => sum + Number(s.cost),
    0
  );
  const scopedTotal = applyComplexity(scopedRawTotal, scopedComplexityFactor);

  // Compute migration total live from the same inputs the Migration
  // Services page uses, instead of trusting the stored
  // computed_total_cost snapshot (which only updates when the migration
  // page's debounced save fires and can lag or be zero on new proposals).
  const migCfg = migrationConfigRes.data;
  const migLines = migrationLinesRes.data ?? [];
  let migrationTotal = 0;
  if (migCfg) {
    // Fail closed on missing BA/PM/Travel rates. Previously the page
    // silently rendered migrationTotal = 0, which is how the Sr. IM
    // bug class (missing lookup_key → $0 cost) stayed invisible.
    if (baRate === null || pmRate === null || travelRate === null) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Unable to load pricing data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              One or more required rate card rows are missing:
              <code>Master|Business Analyst</code>,{" "}
              <code>Master|Program Manager</code>, or{" "}
              <code>Master|Travel Cost/Trip</code>. The migration total
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
      is_effort_included: migCfg.is_effort_included,
      is_workshop_included: migCfg.is_workshop_included,
      pm_contingency_pct: 0,
      ba_complexity_factor: NUM(migCfg.ba_complexity_factor),
      pm_complexity_factor: NUM(migCfg.pm_complexity_factor),
      ba_trips: NUM(migCfg.ba_trips),
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
    migrationTotal = calculateMigrationTotals(
      engineCfg,
      projectLines,
      workflowLines,
      costLines,
      baRate,
      pmRate,
      travelRate
    ).salesPrice;
  }

  const discountPercent = Number(bidSheetRes.data?.discount_percent) || 0;
  const discountDollars = Number(bidSheetRes.data?.discount_dollars) || 0;

  const scenarioOrder = ["P1", "P2", "Opt1", "Opt2"];
  const scenarioRows = scenarioOrder
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
    const totalCost = applyComplexity(Number(s!.summary_total_cost), cf);
    const totalHours = applyComplexity(Number(s!.summary_total_hours), cf);
    const discountedCost = allocateAdjustedTotal(
      totalCost,
      proposalSubtotal,
      pricing.finalTotal
    );
    const marginPercent = calcMarginPercent(discountedCost, totalHours, burdenRate);

    return {
      scenarioType: s!.scenario_type,
      isActive: s!.is_active,
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
  const scopedMargin = calcMarginPercent(scopedDiscountedCost, 0, burdenRate);
  const migrationMargin = calcMarginPercent(migrationDiscountedCost, 0, burdenRate);

  return (
    <div className="space-y-6">
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
                <TableHead className="text-right">Total Cost</TableHead>
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
                      {s.scenarioType}
                    </Link>
                    {s.isActive && (
                      <Badge variant="secondary" className="ml-2">
                        Active
                      </Badge>
                    )}
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
                <TableCell className="text-right text-muted-foreground">—</TableCell>
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
                <TableCell className="text-right text-muted-foreground">—</TableCell>
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
