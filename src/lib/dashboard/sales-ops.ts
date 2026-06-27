import {
  OPEN_PROPOSAL_STATUSES,
  STALE_TRACKED_STATUSES,
  isClosedProposalStatus,
  isOpenProposalStatus,
  isStaleTrackedStatus,
  type StaleTrackedStatus,
} from "@/lib/proposals/status";
import { roundMoney } from "@/lib/calculations/rounding";

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

export type StaleCountInput = {
  now: Date;
  thresholds: Partial<Record<StaleTrackedStatus, number>>;
};

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

function daysBetween(start: string, end: Date): number {
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return 0;
  const ms = end.getTime() - startDate.getTime();
  return Math.floor(ms / 86_400_000);
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
  return proposals.filter((proposal) => {
    if (!isStaleTrackedStatus(proposal.status)) return false;
    if (!proposal.statusChangedAt) return false;

    const thresholdDays = input.thresholds[proposal.status];
    if (!thresholdDays) return false;

    return daysBetween(proposal.statusChangedAt, input.now) > thresholdDays;
  }).length;
}

export function calculateOnHoldCount(
  proposals: SalesOpsDashboardProposal[]
): number {
  return proposals.filter((proposal) => proposal.status === "On Hold").length;
}

export function calculateQuotaProgress(
  proposals: SalesOpsDashboardProposal[],
  input: QuotaProgressInput
): QuotaProgress {
  const closedSoldPrice = roundMoney(
    proposals
      .filter((proposal) => proposal.status === "Closed Won")
      .filter((proposal) =>
        isWithinDateRange(proposal.loeSignedDate, input.dateFrom, input.dateTo)
      )
      .reduce((sum, proposal) => sum + (proposal.soldPrice ?? 0), 0)
  );

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

export function calculateVarianceRollups(
  proposals: SalesOpsDashboardProposal[]
): VarianceRollups {
  return proposals
    .filter((proposal) => isClosedProposalStatus(proposal.status))
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
