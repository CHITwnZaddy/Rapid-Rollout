import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Bid-sheet validation schemas
// ─────────────────────────────────────────────────────────────
// Bid Sheet inputs now flow through server actions, but they still
// enter the system from user-controlled client fields. These schemas
// keep invalid values from reaching the mutation layer, and the
// database-side CHECK constraint in migration 008 remains the
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

export const bidSheetCustomerInputSchema = z.object({
  proposalId: z.uuid("Invalid proposal id"),
  customerId: z.uuid("Invalid customer id"),
});

export const bidSheetDiscountPercentInputSchema = z.object({
  proposalId: z.uuid("Invalid proposal id"),
  discountPercent: discountPercentSchema,
});

export const bidSheetDiscountDollarsInputSchema = z.object({
  proposalId: z.uuid("Invalid proposal id"),
  discountDollars: discountDollarsSchema,
});

export const bidSheetNotesInputSchema = z.object({
  proposalId: z.uuid("Invalid proposal id"),
  notes: z
    .string({ error: "Notes must be text" })
    .max(5000, "Notes cannot exceed 5000 characters"),
});
