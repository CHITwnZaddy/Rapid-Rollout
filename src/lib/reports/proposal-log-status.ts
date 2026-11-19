import { isProposalStatus, PROPOSAL_STATUSES } from "@/lib/constants/statuses";
import { OPEN_PROPOSAL_STATUSES } from "@/lib/proposals/status";

// ─────────────────────────────────────────────────────────────
// Proposal Log status filter: the ?status= preset seeds the dropdown
// once on arrival; after that the dropdown is the only source of truth.
// ─────────────────────────────────────────────────────────────

export const ALL_STATUSES = "All";
export const OPEN_STATUSES = "open";

function parseStatusList(value: string): string[] {
  return value
    .split(",")
    .map((status) => status.trim())
    .filter(isProposalStatus);
}

/**
 * Dropdown value for a `?status=` param: "All", "open", one status, or a
 * comma list. Unknown statuses are dropped; nothing left falls back to "All".
 */
export function initialStatusSelection(param: string | null): string {
  if (!param || param === ALL_STATUSES) return ALL_STATUSES;
  if (param === OPEN_STATUSES) return OPEN_STATUSES;
  const statuses = parseStatusList(param);
  return statuses.length === 0 ? ALL_STATUSES : statuses.join(",");
}

/** Query filter for the current dropdown value (feeds fetchRevenueReportBaseRows). */
export function statusFilterForSelection(selection: string): {
  status?: string;
  statuses?: string[];
} {
  if (selection === ALL_STATUSES) return {};
  if (selection === OPEN_STATUSES) {
    return { statuses: [...OPEN_PROPOSAL_STATUSES] };
  }
  const statuses = parseStatusList(selection);
  if (statuses.length === 0) return {};
  if (statuses.length === 1) return { status: statuses[0] };
  return { statuses };
}

/** Human label for the dropdown value (preset line and XLSX subtitle). */
export function statusSelectionLabel(selection: string): string {
  if (selection === ALL_STATUSES) return "All Statuses";
  if (selection === OPEN_STATUSES) return "All Open Statuses";
  return parseStatusList(selection).join(", ") || "All Statuses";
}

/**
 * Dropdown options. A multi-status preset ("open" or a comma list) gets its
 * own option so the control shows what is actually applied and the user
 * can switch back to it after picking something else.
 */
export function statusFilterOptions(
  presetSelection: string
): { label: string; value: string }[] {
  const options = [
    { label: "All", value: ALL_STATUSES },
    ...PROPOSAL_STATUSES.map((status) => ({ label: status, value: status })),
  ];
  const isMulti =
    presetSelection === OPEN_STATUSES || presetSelection.includes(",");
  if (isMulti) {
    options.splice(1, 0, {
      label: statusSelectionLabel(presetSelection),
      value: presetSelection,
    });
  }
  return options;
}

/** Auto-run gate: run once per arrival URL, after filter data is ready. */
export function shouldAutoRunOnArrival(input: {
  searchParamString: string;
  lastAutoRunKey: string | null;
  filtersLoading: boolean;
  filterError: string | null;
  scopePreset: string;
  currentUserId: string | null;
}): boolean {
  if (!input.searchParamString) return false;
  if (input.lastAutoRunKey === input.searchParamString) return false;
  if (input.filtersLoading || input.filterError) return false;
  if (input.scopePreset === "mine" && !input.currentUserId) return false;
  return true;
}
