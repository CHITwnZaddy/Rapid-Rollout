// Coerce an unknown value to a finite number. Falls back to 0 for
// NaN, null, undefined, or non-numeric strings. Use at the boundary
// between DB/form values and numeric math — never as a silent-zero
// guard for required pricing data (use fetchRequiredRates for that).
export const NUM = (v: unknown): number => Number(v) || 0;
