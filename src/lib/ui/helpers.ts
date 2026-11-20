import { businessDateOf } from "@/lib/dates/business-day";

// Returns a Tailwind badge class string for a margin percentage.
// Thresholds: ≤30% → red, <40% → yellow, ≥40% → green.
export function getMarginBadgeClass(marginPercent: number | null): string {
  if (marginPercent === null) return "bg-muted text-muted-foreground";
  if (marginPercent <= 30) return "bg-red-100 text-red-800";
  if (marginPercent < 40) return "bg-yellow-100 text-yellow-800";
  return "bg-green-100 text-green-800";
}

// Formats a margin percentage for display: a dash when null/undefined (margin
// is null when clientPrice <= 0, per calculateMarginPercent), otherwise the
// value to `digits` decimals with a percent sign. Defaults to 2 decimals.
export function formatMarginPercent(
  marginPercent: number | null | undefined,
  digits = 2
): string {
  return marginPercent == null ? "—" : `${marginPercent.toFixed(digits)}%`;
}

// Returns true when an ISO timestamp falls within [from, to]. The bounds are
// YYYY-MM-DD America/Chicago calendar days, inclusive of both ends, matching the
// DB filter in applyDateRange: a sent-date of 11:30 PM Chicago on 2026-04-18
// matches "to=2026-04-18". A null iso returns true only when there are no
// bounds (unfiltered); an unparseable iso returns false.
export function withinRange(
  iso: string | null,
  from: string | null,
  to: string | null
): boolean {
  if (!iso) return !from && !to;
  const day = businessDateOf(iso);
  if (day == null) return false;
  // Lexical comparison is valid for YYYY-MM-DD strings.
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
