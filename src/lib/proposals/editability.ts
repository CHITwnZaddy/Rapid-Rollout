import { isAdminRole, isManagerRole } from "@/lib/auth/roles";

export type ProposalEditabilityInput = {
  /** The signed-in user's id, or null when there is no session. */
  userId: string | null;
  /** The raw `app_metadata.role` claim; anything unrecognised is a plain user. */
  role: unknown;
  /** `proposals.created_by` for the proposal being viewed. */
  createdBy: string | null;
};

export type ProposalEditability = {
  /** May save the proposal's child tables (scenarios, bid sheet, scope, migration). */
  canEditContent: boolean;
  /** May update the proposals row itself (status, name, closeout figures). */
  canChangeStatus: boolean;
  /** May delete the proposal. */
  canDelete: boolean;
  isOwner: boolean;
};

/**
 * Mirrors the live RLS matrix for a proposal so the UI can tell a user, up
 * front, when the database will refuse their writes:
 *   - child tables: owner or admin
 *   - proposals row update: owner, manager or admin
 *   - proposals row delete: owner or admin
 *
 * Decision D4: controls stay enabled for everyone (SEs back each other up),
 * so this only drives an informational notice; it never gates a control.
 */
export function getProposalEditability({
  userId,
  role,
  createdBy,
}: ProposalEditabilityInput): ProposalEditability {
  const isOwner = Boolean(userId) && Boolean(createdBy) && userId === createdBy;
  const isAdmin = isAdminRole(role);
  const isManager = isManagerRole(role);

  return {
    canEditContent: isOwner || isAdmin,
    canChangeStatus: isOwner || isManager || isAdmin,
    canDelete: isOwner || isAdmin,
    isOwner,
  };
}
