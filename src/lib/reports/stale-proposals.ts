// Row logic for the Stale Proposals report.
//
// The report must count exactly what the dashboard's "Needs follow-up" card
// counts, so it uses the same pieces:
//   - the live per-status thresholds from proposal_stale_thresholds,
//   - classifyStaleness() from sales-ops (strict `>`),
//   - America/Chicago calendar days (businessCalendarDaysBetween), and
//   - the dashboard's `lastChangedAt ?? created_at` fallback for proposals
//     with no status history.
// It applies no date window: stale is a current snapshot (decision D2).

import {
  classifyStaleness,
  staleThresholdFor,
  type StaleThresholds,
} from "@/lib/dashboard/sales-ops";
import { businessCalendarDaysBetween } from "@/lib/dates/business-day";
import { PROPOSAL_STATUSES } from "@/lib/constants/statuses";
import { STALE_TRACKED_STATUSES } from "@/lib/proposals/status";
import type { StatusMetrics } from "./status-history";
import type { ReportProposalRow } from "./data";

export type StaleBucketFilter = "all" | "stale" | "fresh";

export type StaleReportRow = {
  id: string;
  proposalName: string;
  customerName: string;
  status: string;
  daysInStatus: number | null;
  // The status's active threshold, or null when it has none ("No threshold").
  thresholdDays: number | null;
  lastActivity: string | null;
  // null = unclassified: no threshold for the status, or no day count.
  threshold: "stale" | "fresh" | null;
  [key: string]: string | number | null;
};

function statusRank(status: string): number {
  const index = PROPOSAL_STATUSES.indexOf(
    status as (typeof PROPOSAL_STATUSES)[number]
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/** Chicago calendar days since created_at, clamped at 0; null if unknown. */
function daysSinceCreated(
  createdAt: string | null | undefined,
  now: Date
): number | null {
  if (!createdAt) return null;
  const days = businessCalendarDaysBetween(createdAt, now);
  return days == null ? null : Math.max(0, days);
}

/**
 * Builds the report rows: classifies each proposal against its status's
 * threshold, applies the bucket filter, then sorts by the canonical
 * PROPOSAL_STATUSES order and Proposal Name A→Z within each status.
 *
 * The "all" bucket keeps unclassified rows; "stale" and "fresh" drop them.
 */
export function buildStaleReportRows(input: {
  proposals: Pick<
    ReportProposalRow,
    "id" | "name" | "status" | "customer_id" | "created_at"
  >[];
  metrics: Map<string, StatusMetrics>;
  customerNames: Map<string, string>;
  thresholds: StaleThresholds;
  bucket: StaleBucketFilter;
  now: Date;
}): StaleReportRow[] {
  const { metrics, customerNames, thresholds, bucket, now } = input;

  return input.proposals
    .map((p): StaleReportRow => {
      const m = metrics.get(p.id);
      // Mirrors the dashboard's `lastChangedAt ?? created_at`: created_at is
      // used only when the proposal has no status history at all.
      const daysInStatus = m
        ? m.daysInCurrentStatus
        : daysSinceCreated(p.created_at, now);
      return {
        id: p.id,
        proposalName: p.name,
        customerName: customerNames.get(p.customer_id ?? "") ?? "—",
        status: p.status,
        daysInStatus,
        thresholdDays: staleThresholdFor(p.status, thresholds),
        lastActivity: m?.lastChangedAt ?? p.created_at ?? null,
        threshold: classifyStaleness(p.status, daysInStatus, thresholds),
      };
    })
    .filter((row) => {
      if (bucket === "stale") return row.threshold === "stale";
      if (bucket === "fresh") return row.threshold === "fresh";
      return true;
    })
    .sort((a, b) => {
      const byStatus = statusRank(a.status) - statusRank(b.status);
      if (byStatus !== 0) return byStatus;
      return a.proposalName.localeCompare(b.proposalName);
    });
}

/**
 * One-line summary of the thresholds for the export subtitle and the results
 * caption, e.g. "Discovery 21d · Scoping: no threshold · …".
 */
export function describeStaleThresholds(thresholds: StaleThresholds): string {
  return STALE_TRACKED_STATUSES.map((status) => {
    const days = staleThresholdFor(status, thresholds);
    return days == null ? `${status}: no threshold` : `${status} ${days}d`;
  }).join(" · ");
}
