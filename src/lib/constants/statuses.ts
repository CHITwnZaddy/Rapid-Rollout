// Central list of proposal status values. Keep this in sync with any
// DB-level constraints or report filter options so dropdowns, badges,
// and status-history queries all use the same source of truth.

export const PROPOSAL_STATUSES = [
  "Draft",
  "Proposal Sent",
  "Customer Review",
  "Won",
  "Lost",
  "VOID",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

// Semantic variant used by the Badge component next to the dropdown.
export const PROPOSAL_STATUS_VARIANT: Record<
  ProposalStatus,
  "default" | "secondary" | "destructive"
> = {
  Draft: "secondary",
  "Proposal Sent": "default",
  "Customer Review": "default",
  Won: "default",
  Lost: "destructive",
  VOID: "destructive",
};
