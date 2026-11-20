import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { InfoIcon } from "lucide-react";
import { ProposalNav } from "@/components/proposals/proposal-nav";
import { ProposalStatus } from "@/components/proposals/proposal-status";
import { DeleteProposalButton } from "@/components/proposals/delete-proposal-button";
import { EditableProposalName } from "@/components/proposals/editable-proposal-name";
import { safeParseSupabaseResult } from "@/lib/validation/parse-supabase";
import { ProposalHeaderSchema } from "@/lib/validation/proposal";
import { getProposalEditability } from "@/lib/proposals/editability";
import { isAdminRole } from "@/lib/auth/roles";

export default async function ProposalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [proposalResult, { data: varianceReasons }, currentUser] = await Promise.all([
    supabase
      .from("proposals")
      .select(
        "id, name, status, sold_price, loe_value, created_by, customers ( company_name )"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("proposal_variance_reasons")
      .select("code, label")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    // Only drives the backup notice and whether Delete is shown, so any auth
    // failure resolves to null: the notice is simply not shown and Delete
    // stays visible (deleteProposal re-checks ownership on the server).
    supabase.auth.getUser().then(
      ({ data, error }) => (error ? null : data.user),
      () => null
    ),
  ]);

  // A missing row (single() errors) or an unexpected shape both mean there's
  // nothing renderable here, so fall through to the not-found page.
  const parsed = safeParseSupabaseResult(ProposalHeaderSchema, proposalResult);
  if (!parsed.ok) notFound();
  const proposal = parsed.data;

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

  // Decision D4 (resolved 2026-11-19): SEs back each other up, so any
  // signed-in user can save changes to any proposal and every control stays
  // enabled. A non-owner SE gets a quiet note that they are editing someone
  // else's proposal; admins don't (they act across everyone's proposals).
  // Delete stays owner-or-admin, so the button is hidden for anyone else.
  const editability = currentUser
    ? getProposalEditability({
        userId: currentUser.id,
        role: currentUser.app_metadata?.role,
        createdBy: proposal.created_by,
      })
    : null;
  const showBackupNotice =
    editability !== null &&
    editability.canEdit &&
    !editability.isOwner &&
    !isAdminRole(currentUser?.app_metadata?.role) &&
    Boolean(proposal.created_by);
  // Fail open when the user lookup failed: the server action re-checks.
  const showDeleteButton = editability?.canDelete ?? true;

  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-4">
        <div>
          <EditableProposalName proposalId={id} initialName={proposal.name} />
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
        {showDeleteButton && (
          <DeleteProposalButton
            proposalId={id}
            proposalName={proposal.name}
            status={proposal.status}
          />
        )}
      </div>
      {showBackupNotice && (
        <div
          role="note"
          className="mb-3 mt-2 flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
        >
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            You&apos;re editing {scopedBy ?? "another SE"}&apos;s proposal as
            their backup. Your changes save to their proposal, and only they
            or an admin can delete it. Let them know what you changed.
          </p>
        </div>
      )}
      <ProposalNav proposalId={id} />
      <div className="mt-4">{children}</div>
    </div>
  );
}
