export type ScopeOption = { value: string; label: string };

// Classify a scope label into a sort tier. The raw service_hours table
// mixes prompt rows, numeric counts, "Included with no..." sentinels,
// and descriptive labels — a plain .sort() renders them in a confusing
// order (e.g. "19" before "2"). Tiering produces a predictable dropdown.
//
// 0: Prompt rows ("Select # of Processes", "Click here to pick...")
// 1: Pure numeric counts — sorted numerically ("1","2","10","19")
// 2: Any other descriptive label — alphabetical
// 3: "Included with no..." sentinels — pinned to the bottom
export function scopeTier(label: string): number {
  const v = label.trim();
  if (/^Select /i.test(v) || /^Click here/i.test(v)) return 0;
  if (/^\d+$/.test(v)) return 1;
  if (/^Included with no/i.test(v)) return 3;
  return 2;
}

// Stable sort for scope options within a module. Numeric labels are
// compared as numbers within tier 1; everything else uses localeCompare.
export function sortScopeOptions<T extends ScopeOption>(options: T[]): T[] {
  return [...options].sort((a, b) => {
    const ta = scopeTier(a.label);
    const tb = scopeTier(b.label);
    if (ta !== tb) return ta - tb;
    if (ta === 1) return Number(a.label) - Number(b.label);
    return a.label.localeCompare(b.label);
  });
}
