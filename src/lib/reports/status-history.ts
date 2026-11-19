// Shared status-history math for the Proposal Log / Time to Close /
// Stale Proposals / Portfolio Value reports.
//
// Each report was tempted to do its own terminal-status lookup
// logic inline; extracting it here means:
//   1. one definition of "first sent", "first won", "days in current"
//      that all reports share,
//   2. one place to unit-test the edge cases (never sent, re-opened,
//      multiple sent transitions), and
//   3. the reports become pure view code that just renders whatever
//      this helper returns.

import { businessCalendarDaysBetween } from "@/lib/dates/business-day";

export type StatusHistoryRow = {
  proposal_id: string;
  old_status: string | null;
  new_status: string;
  changed_at: string;
};

export type StatusMetrics = {
  // ISO timestamp of the FIRST transition into "Sent for Review" (null
  // if never sent). Used by Time to Close as the "clock start" and by
  // the expanded Proposal Log to surface Date Proposal Sent.
  firstSentAt: string | null;
  // ISO timestamp of the FIRST transition into "Closed Won" (null if not won).
  firstWonAt: string | null;
  // ISO timestamp of the latest transition of any kind. For reports
  // that want "last activity" this beats proposals.updated_at, which
  // bumps on any column edit.
  lastChangedAt: string | null;
  // Calendar days in the business time zone (America/Chicago, DST-safe)
  // since lastChangedAt, clamped at 0; null when there is no history.
  // Compared against the per-status proposal_stale_thresholds by
  // classifyStaleness() in src/lib/dashboard/sales-ops.ts.
  daysInCurrentStatus: number | null;
  // If the proposal has reached Closed Won OR Closed Lost, the calendar-day count (America/Chicago) from
  // firstSentAt to that terminal transition. Null otherwise (still
  // in-flight, or never sent).
  daysToClose: number | null;
  // Convenience: the most recent transition's new_status. Matches
  // proposals.status if history is in sync but defensively derived
  // from history so reports don't need to worry about drift.
  currentStatus: string | null;
};

// Covers clock skew where changed_at is slightly after `now`.
function clampNonNegative(n: number | null): number | null {
  return n == null ? null : Math.max(0, n);
}

/**
 * Compute status metrics for one proposal from its history rows.
 *
 * `rows` can be unsorted and can include rows for other proposals —
 * the function filters by `proposalId` and sorts ascending by
 * `changed_at`. `now` is injectable so tests can pin a clock.
 */
export function computeStatusMetrics(
  proposalId: string,
  rows: StatusHistoryRow[],
  now: Date = new Date()
): StatusMetrics {
  const own = rows
    .filter((r) => r.proposal_id === proposalId)
    .sort(
      (a, b) =>
        new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
    );

  if (own.length === 0) {
    return {
      firstSentAt: null,
      firstWonAt: null,
      lastChangedAt: null,
      daysInCurrentStatus: null,
      daysToClose: null,
      currentStatus: null,
    };
  }

  const firstSent = own.find((r) => r.new_status === "Sent for Review");
  const firstWon = own.find((r) => r.new_status === "Closed Won");
  // "Closed" = terminal transition into Closed Won or Closed Lost. We take the first
  // such row so a re-opened proposal still
  // measures time-to-close from the original close event.
  const firstClosed = own.find(
    (r) => r.new_status === "Closed Won" || r.new_status === "Closed Lost"
  );
  const last = own[own.length - 1];

  return {
    firstSentAt: firstSent?.changed_at ?? null,
    firstWonAt: firstWon?.changed_at ?? null,
    lastChangedAt: last.changed_at,
    daysInCurrentStatus: clampNonNegative(
      businessCalendarDaysBetween(last.changed_at, now)
    ),
    // Signed on purpose: a negative value for a re-opened edge case is
    // pre-existing behaviour.
    daysToClose:
      firstSent && firstClosed
        ? businessCalendarDaysBetween(
            firstSent.changed_at,
            firstClosed.changed_at
          )
        : null,
    currentStatus: last.new_status,
  };
}

/**
 * Bulk version: given all rows for many proposals, return a Map
 * keyed by proposal_id. Avoids re-sorting per proposal when the
 * report already has the whole history set in memory.
 */
export function buildStatusMetricsMap(
  rows: StatusHistoryRow[],
  now: Date = new Date()
): Map<string, StatusMetrics> {
  const byProposal = new Map<string, StatusHistoryRow[]>();
  for (const r of rows) {
    if (!byProposal.has(r.proposal_id)) byProposal.set(r.proposal_id, []);
    byProposal.get(r.proposal_id)!.push(r);
  }
  const out = new Map<string, StatusMetrics>();
  for (const [id, proposalRows] of byProposal) {
    out.set(id, computeStatusMetrics(id, proposalRows, now));
  }
  return out;
}
