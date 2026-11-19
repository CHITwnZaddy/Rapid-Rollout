import {
  OPEN_PROPOSAL_STATUSES,
  STALE_TRACKED_STATUSES,
  isClosedProposalStatus,
  isOpenProposalStatus,
  isStaleTrackedStatus,
  type StaleTrackedStatus,
} from "@/lib/proposals/status";
import { roundMoney } from "@/lib/calculations/rounding";
import { businessCalendarDaysBetween } from "@/lib/dates/business-day";

export type SalesOpsDashboardProposal = {
  id: string;
  status: string;
  ownerId: string | null;
  value: number;
  soldPrice: number | null;
  loeValue: number | null;
  loeSignedDate: string | null;
  statusChangedAt: string | null;
};

export type StageValue = {
  status: string;
  value: number;
};

export type StageCount = {
  status: string;
  count: number;
};

export type QuotaProgressInput = {
  targetAmount: number;
  dateFrom: string;
  dateTo: string;
};

export type QuotaProgress = {
  targetAmount: number;
  closedSoldPrice: number;
  percentToTarget: number;
  remainingToTarget: number;
};

export type StaleThresholds = Partial<Record<StaleTrackedStatus, number>>;
export type StaleCountInput = { now: Date; thresholds: StaleThresholds };

/** A closed deal's financial fields: no pipeline value or status timestamp. */
export type ClosedFinancialsRow = Pick<
  SalesOpsDashboardProposal,
  "id" | "status" | "ownerId" | "soldPrice" | "loeValue" | "loeSignedDate"
>;

/** An inclusive window of YYYY-MM-DD dates. */
type DateWindow = { dateFrom: string; dateTo: string };

export type VarianceRollups = {
  underCount: number;
  evenCount: number;
  overCount: number;
  netVariance: number;
  underVarianceTotal: number;
  overVarianceTotal: number;
};

function isWithinDateRange(dateValue: string | null, dateFrom: string, dateTo: string) {
  if (!dateValue) return false;
  return dateValue >= dateFrom && dateValue <= dateTo;
}

/**
 * The active stale threshold (in days) for a status, or null when the status
 * is not stale-tracked or has no positive threshold.
 */
export function staleThresholdFor(
  status: string,
  thresholds: StaleThresholds
): number | null {
  if (!isStaleTrackedStatus(status)) return null;
  const days = thresholds[status];
  return days && days > 0 ? days : null;
}

/**
 * "stale" when a proposal has been in its status for MORE than the status's
 * threshold (strict >, as the dashboard has always used), "fresh" otherwise.
 * null when there is no threshold for the status or no day count.
 */
export function classifyStaleness(
  status: string,
  daysInStatus: number | null,
  thresholds: StaleThresholds
): "stale" | "fresh" | null {
  const threshold = staleThresholdFor(status, thresholds);
  if (threshold == null || daysInStatus == null) return null;
  return daysInStatus > threshold ? "stale" : "fresh";
}

export function isStale(
  status: string,
  daysInStatus: number | null,
  thresholds: StaleThresholds
): boolean {
  return classifyStaleness(status, daysInStatus, thresholds) === "stale";
}

export function calculateOpenProposalValue(
  proposals: SalesOpsDashboardProposal[]
): number {
  return roundMoney(
    proposals
      .filter((proposal) => isOpenProposalStatus(proposal.status))
      .reduce((sum, proposal) => sum + proposal.value, 0)
  );
}

export function calculateValueByStage(
  proposals: SalesOpsDashboardProposal[]
): StageValue[] {
  return OPEN_PROPOSAL_STATUSES.map((status) => ({
    status,
    value: roundMoney(
      proposals
        .filter((proposal) => proposal.status === status)
        .reduce((sum, proposal) => sum + proposal.value, 0)
    ),
  })).filter((row) => row.value > 0);
}

export function calculateCountByStage(
  proposals: SalesOpsDashboardProposal[]
): StageCount[] {
  return OPEN_PROPOSAL_STATUSES.map((status) => ({
    status,
    count: proposals.filter((proposal) => proposal.status === status).length,
  })).filter((row) => row.count > 0);
}

export function calculateStaleCount(
  proposals: SalesOpsDashboardProposal[],
  input: StaleCountInput
): number {
  // Days in status are Chicago calendar days, so DST changes do not skew them.
  return proposals.filter(
    (proposal) =>
      proposal.statusChangedAt != null &&
      isStale(
        proposal.status,
        businessCalendarDaysBetween(proposal.statusChangedAt, input.now),
        input.thresholds
      )
  ).length;
}

export function calculateOnHoldCount(
  proposals: SalesOpsDashboardProposal[]
): number {
  return proposals.filter((proposal) => proposal.status === "On Hold").length;
}

/**
 * Sum of sold price for Closed Won deals whose LoE signed date falls inside the
 * inclusive window. A null sold price counts as 0; a null LoE signed date is
 * excluded.
 */
export function calculateClosedWonTotal(
  proposals: ReadonlyArray<
    Pick<SalesOpsDashboardProposal, "status" | "soldPrice" | "loeSignedDate">
  >,
  window: DateWindow
): number {
  return roundMoney(
    proposals
      .filter((proposal) => proposal.status === "Closed Won")
      .filter((proposal) =>
        isWithinDateRange(proposal.loeSignedDate, window.dateFrom, window.dateTo)
      )
      .reduce((sum, proposal) => sum + (proposal.soldPrice ?? 0), 0)
  );
}

export function calculateQuotaProgress(
  proposals: ReadonlyArray<
    Pick<SalesOpsDashboardProposal, "status" | "soldPrice" | "loeSignedDate">
  >,
  input: QuotaProgressInput
): QuotaProgress {
  // Filters Closed Won by LoE signed date itself, even when the caller already
  // fetched only those rows (defence in depth).
  const closedSoldPrice = calculateClosedWonTotal(proposals, input);

  return {
    targetAmount: input.targetAmount,
    closedSoldPrice,
    percentToTarget:
      input.targetAmount > 0
        ? roundMoney((closedSoldPrice / input.targetAmount) * 100)
        : 0,
    remainingToTarget: roundMoney(Math.max(input.targetAmount - closedSoldPrice, 0)),
  };
}

/**
 * Rolls up LoE value minus sold price across closed deals. With a window, only
 * deals whose LoE signed date falls inside it (inclusive) count.
 */
export function calculateVarianceRollups(
  proposals: ReadonlyArray<
    Pick<SalesOpsDashboardProposal, "status" | "soldPrice" | "loeValue" | "loeSignedDate">
  >,
  window?: DateWindow
): VarianceRollups {
  return proposals
    .filter((proposal) => isClosedProposalStatus(proposal.status))
    .filter(
      (proposal) =>
        !window ||
        isWithinDateRange(proposal.loeSignedDate, window.dateFrom, window.dateTo)
    )
    .reduce<VarianceRollups>(
      (rollup, proposal) => {
        if (proposal.soldPrice == null || proposal.loeValue == null) {
          return rollup;
        }

        const variance = roundMoney(proposal.loeValue - proposal.soldPrice);
        rollup.netVariance = roundMoney(rollup.netVariance + variance);

        if (variance < 0) {
          rollup.underCount += 1;
          rollup.underVarianceTotal = roundMoney(
            rollup.underVarianceTotal + variance
          );
        } else if (variance > 0) {
          rollup.overCount += 1;
          rollup.overVarianceTotal = roundMoney(rollup.overVarianceTotal + variance);
        } else {
          rollup.evenCount += 1;
        }

        return rollup;
      },
      {
        underCount: 0,
        evenCount: 0,
        overCount: 0,
        netVariance: 0,
        underVarianceTotal: 0,
        overVarianceTotal: 0,
      }
    );
}

export { OPEN_PROPOSAL_STATUSES, STALE_TRACKED_STATUSES };
