export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/calculations/engine";

interface ProposalRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  customers: { company_name: string } | { company_name: string }[] | null;
  scenarios: { scenario_type: string; summary_total_cost: number; summary_total_hours: number }[];
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("proposals")
    .select(
      `
      id,
      name,
      status,
      created_at,
      customers ( company_name ),
      scenarios ( scenario_type, summary_total_cost, summary_total_hours )
    `
    )
    .order("updated_at", { ascending: false })
    .limit(10);
  const proposals = data as ProposalRow[] | null;

  const { count: totalProposals } = await supabase
    .from("proposals")
    .select("*", { count: "exact", head: true });

  const { count: draftCount } = await supabase
    .from("proposals")
    .select("*", { count: "exact", head: true })
    .eq("status", "Draft");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your scoping proposals
          </p>
        </div>
        <Link href="/proposals/new">
          <Button>New Proposal</Button>
        </Link>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Proposals</CardDescription>
            <CardTitle className="text-3xl">{totalProposals ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Drafts</CardDescription>
            <CardTitle className="text-3xl">{draftCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Submitted</CardDescription>
            <CardTitle className="text-3xl">
              {(totalProposals ?? 0) - (draftCount ?? 0)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Recent Proposals</h2>
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
            const bestCost = scenarios.reduce(
              (min: number, s: { summary_total_cost: number }) =>
                s.summary_total_cost > 0 && s.summary_total_cost < min
                  ? s.summary_total_cost
                  : min,
              Infinity
            );

            return (
              <Link key={proposal.id} href={`/proposals/${proposal.id}`}>
                <Card className="transition-colors hover:bg-muted/30">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle className="text-base">
                        {proposal.name}
                      </CardTitle>
                      <CardDescription>
                        {customer?.company_name ?? "No customer"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      {bestCost < Infinity && (
                        <span className="text-sm font-medium">
                          {formatCurrency(bestCost)}
                        </span>
                      )}
                      <Badge
                        variant={
                          proposal.status === "Draft" ? "secondary" : "default"
                        }
                      >
                        {proposal.status}
                      </Badge>
                    </div>
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
