export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
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
import {
  formatCurrency,
  formatHours,
  compareScenarios,
} from "@/lib/calculations/engine";

export default async function ProposalSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [scenarioRes, scopedRes, migrationRes] = await Promise.all([
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
  ]);

  const scenarios = scenarioRes.data;
  if (!scenarios) notFound();

  // Scoped services total
  const scopedTotal = (scopedRes.data ?? []).reduce(
    (sum, s) => sum + Number(s.cost),
    0
  );

  // Migration total
  const migrationTotal = Number(migrationRes.data?.computed_total_cost) || 0;

  // Build scenario summaries for comparison (only P1/P2/Opt1/Opt2)
  const scenarioSummaries = scenarios.map((s) => ({
    scenarioType: s.scenario_type,
    totalHours: Number(s.summary_total_hours),
    totalCost: Number(s.summary_total_cost),
    isActive: s.is_active,
  }));

  // compareScenarios only considers the 4 scenarios (not scoped/migration)
  const comparison = compareScenarios(scenarioSummaries);

  // Ordered display rows: P1, P2, Opt1, Opt2, Scoped Services, Migration Services
  const scenarioOrder = ["P1", "P2", "Opt1", "Opt2"];
  const orderedScenarios = scenarioOrder
    .map((type) => scenarioSummaries.find((s) => s.scenarioType === type))
    .filter(Boolean) as typeof scenarioSummaries;

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
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderedScenarios.map((s) => {
                const isLowestCost =
                  comparison.lowestCost?.scenarioType === s.scenarioType;
                const isLowestHours =
                  comparison.lowestHours?.scenarioType === s.scenarioType;

                return (
                  <TableRow key={s.scenarioType}>
                    <TableCell className="font-medium">
                      {s.scenarioType}
                      {s.isActive && (
                        <Badge variant="secondary" className="ml-2">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatHours(s.totalHours)}
                      {isLowestHours && s.totalHours > 0 && (
                        <Badge className="ml-2 bg-green-600">
                          Lowest
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(s.totalCost)}
                      {isLowestCost && s.totalCost > 0 && (
                        <Badge className="ml-2 bg-green-600">
                          Lowest
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {s.totalCost > 0 ? (
                        <Badge variant="default">Configured</Badge>
                      ) : (
                        <Badge variant="secondary">Empty</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Scoped Services */}
              <TableRow>
                <TableCell className="font-medium">Scoped Services</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  —
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(scopedTotal)}
                </TableCell>
                <TableCell className="text-center">
                  {scopedTotal > 0 ? (
                    <Badge variant="default">Configured</Badge>
                  ) : (
                    <Badge variant="secondary">Empty</Badge>
                  )}
                </TableCell>
              </TableRow>

              {/* Migration Services */}
              <TableRow>
                <TableCell className="font-medium">Migration Services</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  —
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(migrationTotal)}
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
