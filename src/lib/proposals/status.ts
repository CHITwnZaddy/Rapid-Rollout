import { PROPOSAL_STATUSES, type ProposalStatus } from "@/lib/constants/statuses";

export const STALE_TRACKED_STATUSES = [
  "Discovery",
  "Scoping",
  "Proposal Draft",
  "Sent for Review",
  "Negotiations",
  "Awaiting Sig",
] as const satisfies readonly ProposalStatus[];

export const OPEN_PROPOSAL_STATUSES = [
  ...STALE_TRACKED_STATUSES,
  "On Hold",
] as const satisfies readonly ProposalStatus[];

export const CLOSED_PROPOSAL_STATUSES = [
  "Closed Won",
  "Closed Lost",
] as const satisfies readonly ProposalStatus[];

export type ClosedProposalStatus = (typeof CLOSED_PROPOSAL_STATUSES)[number];
export type OpenProposalStatus = (typeof OPEN_PROPOSAL_STATUSES)[number];
export type StaleTrackedStatus = (typeof STALE_TRACKED_STATUSES)[number];
export type ProposalStatusBucket = "open" | "hold" | "closed" | "unknown";

export function isProposalStatus(status: unknown): status is ProposalStatus {
  return PROPOSAL_STATUSES.includes(status as ProposalStatus);
}

export function isOpenProposalStatus(status: unknown): status is OpenProposalStatus {
  return OPEN_PROPOSAL_STATUSES.includes(status as OpenProposalStatus);
}

export function isClosedProposalStatus(
  status: unknown
): status is ClosedProposalStatus {
  return CLOSED_PROPOSAL_STATUSES.includes(status as ClosedProposalStatus);
}

export function isStaleTrackedStatus(status: unknown): status is StaleTrackedStatus {
  return STALE_TRACKED_STATUSES.includes(status as StaleTrackedStatus);
}

export function getStatusBucket(status: unknown): ProposalStatusBucket {
  if (status === "On Hold") return "hold";
  if (isClosedProposalStatus(status)) return "closed";
  if (isOpenProposalStatus(status)) return "open";
  return "unknown";
}
