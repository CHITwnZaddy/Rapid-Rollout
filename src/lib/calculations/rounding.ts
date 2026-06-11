// ─────────────────────────────────────────────────────────────
// Rounding policy (decided 2026-06-10)
// ─────────────────────────────────────────────────────────────
// Calculations run at full float precision internally. Rounding
// happens ONCE, at the edge — wherever a number leaves the system
// (display, XLSX/PDF export, or a value persisted for client-facing
// use). Stored client-facing values use the same rounding as display
// so the database and the screen never disagree.
//
//   • Money    → nearest cent (2 decimals)
//   • Percent  → 2 decimals
//   • Hours    → ALWAYS round UP to the whole hour. 42.05 → 43.
//     Estimation error must land in our favor, never the client's.
//     Exact whole numbers stay put (43 stays 43).
// ─────────────────────────────────────────────────────────────

function round2(value: number): number {
  // EPSILON nudge avoids 1.005 → 1.00 float artifacts.
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return round2(value);
}

export function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return round2(value);
}

export function ceilHours(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Guard against float dust pushing an exact whole number up:
  // 43.000000000000007 (from accumulation) must stay 43, not 44.
  const nearest = Math.round(value);
  if (Math.abs(value - nearest) < 1e-9) return nearest;
  return Math.ceil(value);
}
