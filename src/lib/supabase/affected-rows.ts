// Row-level security makes a Supabase .update() or .delete() on a row the
// caller may not change return no error and zero affected rows. Every write
// that can be refused this way must request { count: "exact" } and pass the
// result through checkAffectedRows, so a refused write reports an error
// instead of a false "Saved".
//
// The live policies (supabase/migrations) let only a proposal's owner or an
// admin write its child tables (scenarios, scenario_lines, bid_sheets,
// scoped_services, migration_config, migration_detail_lines); managers can
// also update the proposals row itself. Customers can be changed by their
// creator or an admin; rate cards and service hours by admins; sales-ops
// settings by managers and admins.

export const PROPOSAL_EDIT_NOT_PERMITTED =
  "This change wasn't saved. Only the proposal's owner or an admin can edit it.";

// For writes to the proposals row itself (status, closeout fields, the
// scoped complexity factor), which managers may also make.
export const PROPOSAL_ROW_NOT_PERMITTED =
  "This change wasn't saved. Only the proposal's owner, a manager, or an admin can change it.";

export const CUSTOMER_EDIT_NOT_PERMITTED =
  "This change wasn't saved. Only the person who created this customer, or an admin, can change it.";

export const ROW_NOT_SAVED =
  "This change wasn't saved. The row may have been removed, or you may not have permission to change it.";

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
