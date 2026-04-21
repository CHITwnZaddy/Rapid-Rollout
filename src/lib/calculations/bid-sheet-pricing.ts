export type BidSheetPricing = {
  subtotal: number;
  afterCredit: number;
  finalTotal: number;
};

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

  return {
    subtotal: safeSubtotal,
    afterCredit,
    finalTotal,
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
