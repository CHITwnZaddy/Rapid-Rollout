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

export type ProposalStatusBucket = "open" | "hold" | "closed" | "unknown";

export function isProposalStatus(status: unknown): status is ProposalStatus {
  return PROPOSAL_STATUSES.includes(status as ProposalStatus);
}

export function isOpenProposalStatus(status: unknown): status is ProposalStatus {
  return OPEN_PROPOSAL_STATUSES.includes(status as ProposalStatus);
}

export function isClosedProposalStatus(status: unknown): status is ProposalStatus {
  return CLOSED_PROPOSAL_STATUSES.includes(status as ProposalStatus);
}

export function isStaleTrackedStatus(status: unknown): status is ProposalStatus {
  return STALE_TRACKED_STATUSES.includes(status as ProposalStatus);
}

export function getStatusBucket(status: unknown): ProposalStatusBucket {
  if (status === "On Hold") return "hold";
  if (isClosedProposalStatus(status)) return "closed";
  if (isOpenProposalStatus(status)) return "open";
  return "unknown";
}
