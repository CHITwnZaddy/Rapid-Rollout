// Per-user "My Proposals" count requires auth.uid() — must be dynamic.
export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/calculations/engine";
import { applyComplexity } from "@/lib/calculations/complexity";

interface ProposalRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  customers: { company_name: string } | { company_name: string }[] | null;
  scenarios: {
    scenario_type: string;
    summary_total_cost: number;
    summary_total_hours: number;
    complexity_factor?: number;
  }[];
}

type FilterValue = "all" | "draft" | "submitted" | "mine";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;
  const filter: FilterValue =
    sp.filter === "draft"
      ? "draft"
      : sp.filter === "submitted"
        ? "submitted"
        : sp.filter === "mine"
          ? "mine"
          : "all";

  // Current user — needed for the My Proposals count and filter.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  // Base proposals query for the Recent Proposals list.
  let proposalsQuery = supabase
    .from("proposals")
    .select(
      `
      id,
      name,
      status,
      created_at,
      customers ( company_name ),
      scenarios ( scenario_type, summary_total_cost, summary_total_hours, complexity_factor )
    `
    )
    .order("updated_at", { ascending: false })
    .limit(10);

  if (filter === "draft") {
    proposalsQuery = proposalsQuery.eq("status", "Draft");
  } else if (filter === "submitted") {
    proposalsQuery = proposalsQuery.neq("status", "Draft");
  } else if (filter === "mine" && userId) {
    proposalsQuery = proposalsQuery.eq("created_by", userId);
  }

  // Run all queries in parallel — proposal list + three counts.
  const [proposalsRes, totalRes, draftRes, myRes] = await Promise.all([
    proposalsQuery,
    supabase.from("proposals").select("*", { count: "exact", head: true }),
    supabase
      .from("proposals")
      .select("*", { count: "exact", head: true })
      .eq("status", "Draft"),
    userId
      ? supabase
          .from("proposals")
          .select("*", { count: "exact", head: true })
          .eq("created_by", userId)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  const proposals = proposalsRes.data as ProposalRow[] | null;
  const totalProposals = totalRes.count;
  const draftCount = draftRes.count;
  const submittedCount = (totalProposals ?? 0) - (draftCount ?? 0);
  const myCount = myRes.count ?? 0;

  const cardClass = (isActive: boolean) =>
    `transition-colors ${isActive ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/30"}`;

  const filterLabel =
    filter === "draft"
      ? "Draft only"
      : filter === "submitted"
        ? "Submitted only"
        : filter === "mine"
          ? "My proposals only"
          : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Proposal Dashboard</h1>
        <Link href="/proposals/new">
          <Button>New Proposal</Button>
        </Link>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Link href="/dashboard?filter=all">
          <Card className={cardClass(filter === "all")}>
            <CardHeader className="pb-2">
              <CardDescription>Total Proposals</CardDescription>
              <CardTitle className="text-3xl">{totalProposals ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/dashboard?filter=draft">
          <Card className={cardClass(filter === "draft")}>
            <CardHeader className="pb-2">
              <CardDescription>Drafts</CardDescription>
              <CardTitle className="text-3xl">{draftCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/dashboard?filter=submitted">
          <Card className={cardClass(filter === "submitted")}>
            <CardHeader className="pb-2">
              <CardDescription>Submitted</CardDescription>
              <CardTitle className="text-3xl">{submittedCount}</CardTitle>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/dashboard?filter=mine">
          <Card className={cardClass(filter === "mine")}>
            <CardHeader className="pb-2">
              <CardDescription>My Proposals</CardDescription>
              <CardTitle className="text-3xl">{myCount}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <h2 className="mb-4 text-lg font-semibold">
        Recent Proposals
        {filterLabel && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({filterLabel})
          </span>
        )}
      </h2>

      {!proposals?.length ? (
        <Card>
          <CardHeader className="py-12 text-center text-muted-foreground">
            No proposals found for this filter.
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {proposals.map((proposal) => {
            const customer = Array.isArray(proposal.customers)
              ? proposal.customers[0]
              : proposal.customers;
            const scenarios = proposal.scenarios ?? [];
            const bestCost = scenarios.reduce(
              (
                min: number,
                s: { summary_total_cost: number; complexity_factor?: number }
              ) => {
                const adjustedCost = applyComplexity(
                  s.summary_total_cost,
                  s.complexity_factor ?? 1
                );
                return adjustedCost > 0 && adjustedCost < min
                  ? adjustedCost
                  : min;
              },
              Infinity
            );

            return (
              <Link key={proposal.id} href={`/proposals/${proposal.id}`}>
                <Card className="transition-colors hover:bg-muted/30">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <CardTitle className="text-base">{proposal.name}</CardTitle>
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
