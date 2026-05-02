// Central list of proposal status values. Keep this in sync with any
// DB-level constraints or report filter options so dropdowns, badges,
// and status-history queries all use the same source of truth.

export const PROPOSAL_STATUSES = [
  "Discovery",
  "Scoping",
  "Proposal Draft",
  "Sent for Review",
  "Negotiations",
  "Awaiting Sig",
  "Closed Won",
  "Closed Lost",
  "On Hold",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

// Semantic variant used by the Badge component next to the dropdown.
export const PROPOSAL_STATUS_VARIANT: Record<
  ProposalStatus,
  "default" | "secondary" | "destructive"
> = {
  Discovery: "secondary",
  Scoping: "default",
  "Proposal Draft": "secondary",
  "Sent for Review": "default",
  Negotiations: "default",
  "Awaiting Sig": "default",
  "Closed Won": "default",
  "Closed Lost": "destructive",
  "On Hold": "secondary",
};
