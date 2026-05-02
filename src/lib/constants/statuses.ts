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

export function isProposalStatus(status: unknown): status is ProposalStatus {
  return PROPOSAL_STATUSES.includes(status as ProposalStatus);
}

// Semantic variant used by the Badge component next to the dropdown.
export const PROPOSAL_STATUS_VARIANT: Record<
  ProposalStatus,
  "default" | "secondary" | "destructive" | "sage" | "amber" | "rose" | "slate" | "neutral"
> = {
  Discovery: "neutral",
  Scoping: "secondary",
  "Proposal Draft": "neutral",
  "Sent for Review": "default",
  Negotiations: "amber",
  "Awaiting Sig": "amber",
  "Closed Won": "sage",
  "Closed Lost": "rose",
  "On Hold": "slate",
};

export const PROPOSAL_STATUS_BAR_CLASS: Record<ProposalStatus, string> = {
  Discovery: "bg-stone-400/70",
  Scoping: "bg-sky-500/65",
  "Proposal Draft": "bg-zinc-500/65",
  "Sent for Review": "bg-indigo-500/65",
  Negotiations: "bg-amber-500/70",
  "Awaiting Sig": "bg-yellow-600/60",
  "Closed Won": "bg-emerald-500/65",
  "Closed Lost": "bg-rose-500/60",
  "On Hold": "bg-slate-500/65",
};
