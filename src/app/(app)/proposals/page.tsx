export const dynamic = "force-dynamic";

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

interface ProposalRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  customers: { company_name: string } | { company_name: string }[] | null;
  scenarios: { scenario_type: string; summary_total_cost: number; summary_total_hours: number }[];
}

export default async function ProposalsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("proposals")
    .select(
      `
      id,
      name,
      status,
      created_at,
      updated_at,
      customers ( company_name ),
      scenarios ( scenario_type, summary_total_cost, summary_total_hours )
    `
    )
    .order("updated_at", { ascending: false });
  const proposals = data as ProposalRow[] | null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Proposals</h1>
        <Link href="/proposals/new">
          <Button>New Proposal</Button>
        </Link>
      </div>

      {!proposals?.length ? (
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
                          proposal.status === "Draft" ? "secondary" : "default"
                        }
                      >
                        {proposal.status}
                      </Badge>
                    </div>
                    {scenarios.length > 0 && (
                      <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
                        {scenarios
                          .filter(
                            (s: { summary_total_cost: number }) =>
                              s.summary_total_cost > 0
                          )
                          .map(
                            (s: {
                              scenario_type: string;
                              summary_total_cost: number;
                              summary_total_hours: number;
                            }) => (
                              <span key={s.scenario_type}>
                                <span className="font-medium">
                                  {s.scenario_type}:
                                </span>{" "}
                                {formatCurrency(s.summary_total_cost)} &middot;{" "}
                                {formatHours(s.summary_total_hours)} hrs
                              </span>
                            )
                          )}
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
