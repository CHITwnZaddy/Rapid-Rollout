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

// Returns true when an ISO timestamp falls within [from, to] (YYYY-MM-DD, inclusive).
// A null iso with no date bounds returns true (unfiltered). The "to" bound extends
// to end-of-day so a sent-date of 2026-04-18T23:xx still matches "to=2026-04-18".
export function withinRange(
  iso: string | null,
  from: string | null,
  to: string | null
): boolean {
  if (!iso) return !from && !to;
  const ts = new Date(iso).getTime();
  if (from && ts < new Date(from).getTime()) return false;
  if (to && ts > new Date(to + "T23:59:59.999Z").getTime()) return false;
  return true;
}
