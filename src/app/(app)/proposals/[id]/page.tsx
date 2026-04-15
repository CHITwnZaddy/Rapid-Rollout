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

function getMarginBadgeClass(marginPercent: number | null) {
  if (marginPercent === null) return "bg-muted text-muted-foreground";
  if (marginPercent <= 30) return "bg-red-100 text-red-800";
  if (marginPercent < 40) return "bg-yellow-100 text-yellow-800";
  return "bg-green-100 text-green-800";
}

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

  const [scenarioRes, scopedRes, migrationRes, bidSheetRes, burdenRes] =
    await Promise.all([
      supabase
        .from("scenarios")
        .select("scenario_type, summary_total_hours, summary_total_cost, is_active")
        .eq("proposal_id", id)
        .order("scenario_type"),
      supabase
        .from("scoped_services")
        .select("cost")
        .eq("proposal_id", id),
      supabase
        .from("migration_config")
        .select("computed_total_cost")
        .eq("proposal_id", id)
        .single(),
      supabase
        .from("bid_sheets")
        .select("discount_percent, discount_dollars")
        .eq("proposal_id", id)
        .single(),
      supabase
        .from("rate_cards")
        .select("rate")
        .eq("lookup_key", "Master|Burden Rate")
        .single(),
    ]);

  // Fail closed: margins are pricing-critical. If we can't read the
  // burden rate, refuse to render margins rather than silently use a
  // stale default. See migration 007 for the seed row.
  if (burdenRes.error || burdenRes.data?.rate == null) {
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
  const burdenRate = Number(burdenRes.data.rate);

  const scenarios = scenarioRes.data;
  if (!scenarios) notFound();

  const scopedTotal = (scopedRes.data ?? []).reduce(
    (sum, s) => sum + Number(s.cost),
    0
  );
  const migrationTotal = Number(migrationRes.data?.computed_total_cost) || 0;

  const discountPercent = Number(bidSheetRes.data?.discount_percent) || 0;
  const discountDollars = Number(bidSheetRes.data?.discount_dollars) || 0;

  const scenarioOrder = ["P1", "P2", "Opt1", "Opt2"];
  const scenarioRows = scenarioOrder
    .map((type) => scenarios.find((s) => s.scenario_type === type))
    .filter(Boolean);

  const scenarioSubtotal = scenarioRows.reduce(
    (sum, s) => sum + Number(s!.summary_total_cost),
    0
  );

  const afterDollar = Math.max(0, scenarioSubtotal - discountDollars);
  const discountedScenarioTotal = afterDollar * (1 - discountPercent / 100);

  const allocated = scenarioRows.map((s) => {
    const totalCost = Number(s!.summary_total_cost);
    const totalHours = Number(s!.summary_total_hours);
    const share = scenarioSubtotal > 0 ? totalCost / scenarioSubtotal : 0;
    const discountedCost = discountedScenarioTotal * share;
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

  const scopedMargin = calcMarginPercent(scopedTotal, 0, burdenRate);
  const migrationMargin = calcMarginPercent(migrationTotal, 0, burdenRate);

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
                  {formatCurrency(scopedTotal)}
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
                  {formatCurrency(migrationTotal)}
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
