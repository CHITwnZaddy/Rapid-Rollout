// Row-level security makes a Supabase .update() or .delete() on a row the
// caller can't see or may not change return no error and zero affected rows.
// Every write that can match nothing this way must request { count: "exact" }
// and pass the result through checkAffectedRows, so a write that changed
// nothing reports an error instead of a false "Saved".
//
// Who may write what (supabase/migrations, latest
// 20261119220158_allow_any_se_to_edit_proposals.sql). SEs act as backups for
// each other, so editing a proposal is shared the same way reading it is:
//   - Edit any tab (scenario grid, complexity factors, bid sheet, scoped
//     services lines, migration config and rows, Clear Tab), rename, change
//     status, close won/lost: any signed-in user.
//   - Correct closed-won financials: a manager or an admin (a trigger guards
//     the correction stamp).
//   - Delete a proposal: its owner (proposals.created_by) or an admin.
//   - Change who owns a proposal: an admin only (trigger, error 42501).
//   - Create or delete the structural rows (scenarios, scenario_lines,
//     bid_sheets, migration_config): the owner or an admin. The app only does
//     this in create_proposal_bundle and the proposal-delete cascade.
// Customers can be changed by their creator or an admin; rate cards and
// service hours by admins; sales-ops settings by managers and admins.
//
// So a proposal write that affects zero rows doesn't mean "not permitted": the
// proposal or row was deleted (for example in another tab) or the session
// ended. Proposal writes still count rows and report PROPOSAL_CHANGE_NOT_SAVED.

export const PROPOSAL_CHANGE_NOT_SAVED =
  "This change wasn't saved. The proposal may have been deleted, or you may have been signed out. Reload the page and try again.";

export const CUSTOMER_EDIT_NOT_PERMITTED =
  "This change wasn't saved. Only the person who created this customer, or an admin, can change it.";

export const ROW_NOT_SAVED =
  "This change wasn't saved. The row may have been removed, or you may not have permission to change it.";

// Unlike updates and deletes, an insert that RLS refuses does raise:
// Postgres error 42501, "new row violates row-level security policy ...".
export function isRowLevelSecurityError(
  error: { code?: string; message: string } | null
): boolean {
  if (!error) return false;
  return error.code === "42501" || error.message.includes("row-level security");
}

export type WriteCheckResult = { ok: true } | { ok: false; error: string };

type CountedWriteResult = {
  error: { message: string } | null;
  count: number | null;
};

/**
 * Turn a counted Supabase write into the { ok, error } contract.
 *
 * `count` is only populated when the query asked for { count: "exact" }; a
 * null count is treated as a failure so a forgotten option cannot quietly
 * report success.
 */
export function checkAffectedRows(
  result: CountedWriteResult,
  notPermittedMessage: string
): WriteCheckResult {
  if (result.error) {
    return { ok: false, error: result.error.message };
  }
  if (result.count === null || result.count < 1) {
    return { ok: false, error: notPermittedMessage };
  }
  return { ok: true };
}
