import { isAdminRole } from "@/lib/auth/roles";

export type ProposalEditabilityInput = {
  /** The signed-in user's id, or null when there is no session. */
  userId: string | null;
  /** The raw `app_metadata.role` claim; anything unrecognised is a plain user. */
  role: unknown;
  /** `proposals.created_by` for the proposal being viewed. */
  createdBy: string | null;
};

export type ProposalEditability = {
  /**
   * May save changes to the proposal and every tab (scenario grid, complexity
   * factors, bid sheet, scoped services, migration), rename it, change its
   * status and close it won/lost.
   */
  canEdit: boolean;
  /** May delete the proposal. */
  canDelete: boolean;
  isOwner: boolean;
};

/**
 * Mirrors the live RLS matrix for a proposal (migration
 * 20261119220158_allow_any_se_to_edit_proposals) so the UI can show who may
 * do what. SEs act as backups for each other, so editing is shared:
 *   - edit any tab (scenario grid, complexity factors, bid sheet, scoped
 *     services lines incl. add/remove/Clear Tab, migration config and rows
 *     incl. add/remove/Clear Tab): any signed-in user
 *   - rename, change status, close won/lost (sold price, LoE value/date):
 *     any signed-in user
 *   - correct closed-won financials: manager or admin (enforced by
 *     correctClosedProposalFinancials and a DB guard on the correction stamp;
 *     not modelled here)
 *   - delete the proposal: owner or admin
 *   - change who owns it (created_by): admin only (DB trigger, 42501; the app
 *     never does this)
 * Edits are not attributed yet (no change tracking); status changes still
 * record who made them.
 */
export function getProposalEditability({
  userId,
  role,
  createdBy,
}: ProposalEditabilityInput): ProposalEditability {
  const isSignedIn = Boolean(userId);
  const isOwner = isSignedIn && Boolean(createdBy) && userId === createdBy;
  const isAdmin = isAdminRole(role);

  return {
    canEdit: isSignedIn,
    canDelete: isSignedIn && (isOwner || isAdmin),
    isOwner,
  };
}
