import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProposalNav } from "@/components/proposals/proposal-nav";
import { ProposalStatus } from "@/components/proposals/proposal-status";
import { DeleteProposalButton } from "@/components/proposals/delete-proposal-button";

interface ProposalData {
  id: string;
  name: string;
  status: string;
  sold_price: number | null;
  loe_value: number | null;
  created_by: string | null;
  customers: { company_name: string } | { company_name: string }[] | null;
}

export default async function ProposalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data }, { data: varianceReasons }] = await Promise.all([
    supabase
    .from("proposals")
      .select("id, name, status, sold_price, loe_value, created_by, customers ( company_name )")
    .eq("id", id)
      .single(),
    supabase
      .from("proposal_variance_reasons")
      .select("code, label")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);
  const proposal = data as ProposalData | null;

  if (!proposal) notFound();

  const customer = Array.isArray(proposal.customers)
    ? proposal.customers[0]
    : proposal.customers;

  // "Scoped by" = the proposal creator's display name. Separate query
  // because proposals.created_by references auth.users, not profiles,
  // so PostgREST can't embed the join. Fails soft: no profile row just
  // means the name is omitted from the header.
  let scopedBy: string | null = null;
  if (proposal.created_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", proposal.created_by)
      .maybeSingle();
    scopedBy = profile?.display_name ?? null;
  }

  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{proposal.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {customer?.company_name ?? "No customer"} &middot;{" "}
            {scopedBy && <>Scoped by {scopedBy} &middot;{" "}</>}
            <ProposalStatus
              proposalId={id}
              initialStatus={proposal.status}
              initialSoldPrice={Number(proposal.sold_price ?? 0)}
              initialLoeValue={Number(proposal.loe_value ?? 0)}
              varianceReasons={varianceReasons ?? []}
            />
          </div>
        </div>
        <DeleteProposalButton
          proposalId={id}
          proposalName={proposal.name}
          status={proposal.status}
        />
      </div>
      <ProposalNav proposalId={id} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
