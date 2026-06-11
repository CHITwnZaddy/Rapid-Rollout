import { roundMoney } from "@/lib/calculations/rounding";

export type BidSheetPricing = {
  subtotal: number;
  afterCredit: number;
  finalTotal: number;
};

// Discount order of operations (business rule, confirmed 2026-06-10):
//   net = (subtotal − dollar credit) × (1 − percent / 100)
// The dollar credit comes off FIRST — it is prepaid Letter-of-Engagement
// money, not a discount. The percent (rare, competitive undercut) applies
// to what remains. This function is the single source of truth for that
// combination; bid sheet, exports, margin calcs, and reports must all
// route through it rather than re-deriving the math.
export function calculateBidSheetPricing(
  subtotal: number,
  credit: number,
  discountPercent: number
): BidSheetPricing {
  const safeSubtotal = Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
  const safeCredit = Number.isFinite(credit) ? Math.max(0, credit) : 0;
  const safeDiscountPercent = Number.isFinite(discountPercent)
    ? Math.min(100, Math.max(0, discountPercent))
    : 0;

  const afterCredit = Math.max(0, safeSubtotal - safeCredit);
  const finalTotal = afterCredit * (1 - safeDiscountPercent / 100);

  // These are the client-facing edge values — round to the cent here so
  // display, export, and persistence always agree.
  return {
    subtotal: roundMoney(safeSubtotal),
    afterCredit: roundMoney(afterCredit),
    finalTotal: roundMoney(finalTotal),
  };
}

export function allocateAdjustedTotal(
  componentTotal: number,
  subtotal: number,
  adjustedSubtotal: number
): number {
  if (subtotal <= 0 || adjustedSubtotal <= 0 || componentTotal <= 0) {
    return 0;
  }

  return adjustedSubtotal * (componentTotal / subtotal);
}
