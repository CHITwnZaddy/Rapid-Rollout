import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Bid-sheet validation schemas
// ─────────────────────────────────────────────────────────────
// Phase 1.4 — bid-sheet inputs go straight to Supabase today,
// which means users can submit NaN, Infinity, or out-of-range
// values that silently corrupt downstream pricing calculations.
// These schemas gate every save at the client boundary; the
// database-side CHECK constraint in migration 008 is the
// defense in depth behind them.
//
// Business rules (confirmed with the user):
//   • discount_percent is always 0–100.
//   • discount_dollars is always >= 0. The field represents
//     either a negotiated discount OR a credit from prior
//     Letter-of-Engagement work — but in both cases the SE
//     enters a positive number and it is SUBTRACTED from the
//     proposal total. Negative values have no business meaning
//     and would inflate the quote, so we reject them at the
//     boundary.
// ─────────────────────────────────────────────────────────────

export const discountPercentSchema = z
  .number({ error: "Discount % must be a number" })
  .finite("Discount % must be a finite number")
  .min(0, "Discount % cannot be negative")
  .max(100, "Discount % cannot exceed 100");

export const discountDollarsSchema = z
  .number({ error: "Discount $ must be a number" })
  .finite("Discount $ must be a finite number")
  .min(0, "Discount $ cannot be negative");

export const bidSheetDiscountSchema = z.object({
  discount_percent: discountPercentSchema,
  discount_dollars: discountDollarsSchema,
});

export type BidSheetDiscount = z.infer<typeof bidSheetDiscountSchema>;
