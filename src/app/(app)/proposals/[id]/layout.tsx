import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProposalNav } from "@/components/proposals/proposal-nav";
import { ProposalStatus } from "@/components/proposals/proposal-status";
import { DeleteProposalButton } from "@/components/proposals/delete-proposal-button";

interface ProposalData {
  id: string;
  name: string;
  status: string;
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

  const { data } = await supabase
    .from("proposals")
    .select("id, name, status, customers ( company_name )")
    .eq("id", id)
    .single();
  const proposal = data as ProposalData | null;

  if (!proposal) notFound();

  const customer = Array.isArray(proposal.customers)
    ? proposal.customers[0]
    : proposal.customers;

  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{proposal.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {customer?.company_name ?? "No customer"} &middot;{" "}
            <ProposalStatus proposalId={id} initialStatus={proposal.status} />
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
