// Phase 2.7 — proposals list is globally readable per RLS
// (SE backup workflow), so the same HTML is safe to serve to
// every user. 60s revalidation keeps new proposals visible
// quickly without hitting Supabase on every request.
export const revalidate = 60;

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatHours } from "@/lib/calculations/engine";
import { applyComplexity } from "@/lib/calculations/complexity";
import { getScenarioDisplayName } from "@/lib/scenarios/display";
import { safeParseSupabaseResult } from "@/lib/validation/parse-supabase";
import { ProposalListSchema } from "@/lib/validation/proposal";
import {
  PROPOSAL_STATUS_VARIANT,
  type ProposalStatus,
} from "@/lib/constants/statuses";

export default async function ProposalsPage() {
  const supabase = await createClient();

  const proposalsResult = await supabase
    .from("proposals")
    .select(
      `
      id,
      name,
      status,
      created_at,
      updated_at,
      customers ( company_name ),
      scenarios ( scenario_type, summary_total_cost, summary_total_hours, complexity_factor )
    `
    )
    .order("updated_at", { ascending: false });

  const parsed = safeParseSupabaseResult(ProposalListSchema, proposalsResult);
  if (!parsed.ok) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Proposals</h1>
          <Link href="/proposals/new">
            <Button>New Proposal</Button>
          </Link>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Unable to load proposals. Refresh to retry.
          </CardContent>
        </Card>
      </div>
    );
  }
  const proposals = parsed.data;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Proposals</h1>
        <Link href="/proposals/new">
          <Button>New Proposal</Button>
        </Link>
      </div>

      {!proposals.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No proposals yet. Create your first one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {proposals.map((proposal) => {
            const customer = Array.isArray(proposal.customers)
              ? proposal.customers[0]
              : proposal.customers;
            const scenarios = proposal.scenarios ?? [];

            return (
              <Link key={proposal.id} href={`/proposals/${proposal.id}`}>
                <Card className="transition-colors hover:bg-muted/30">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {proposal.name}
                        </CardTitle>
                        <CardDescription>
                          {customer?.company_name ?? "No customer"} &middot;{" "}
                          {new Date(proposal.created_at).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={
                          PROPOSAL_STATUS_VARIANT[proposal.status as ProposalStatus] ??
                          "secondary"
                        }
                      >
                        {proposal.status}
                      </Badge>
                    </div>
                    {scenarios.length > 0 && (
                      <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
                        {scenarios
                          .filter((s) => s.summary_total_cost > 0)
                          .map((s) => (
                            <span key={s.scenario_type}>
                              <span className="font-medium">
                                {getScenarioDisplayName(s.scenario_type)}:
                              </span>{" "}
                              {formatCurrency(
                                applyComplexity(
                                  s.summary_total_cost,
                                  s.complexity_factor ?? 1
                                )
                              )}{" "}
                              &middot;{" "}
                              {formatHours(
                                applyComplexity(
                                  s.summary_total_hours,
                                  s.complexity_factor ?? 1
                                )
                              )}{" "}
                              hrs
                            </span>
                          ))}
                      </div>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
