import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Proposal form validation
// ─────────────────────────────────────────────────────────────
// Phase 1.5 — gate the new-proposal form at the client boundary
// so empty/whitespace names and malformed customer ids can't
// reach Supabase. The proposals table has NOT NULL on `name`
// but nothing server-side prevents `"   "`, which would produce
// an unreadable row on the dashboard.
// ─────────────────────────────────────────────────────────────

export const newProposalSchema = z.object({
  name: z
    .string({ error: "Proposal name is required" })
    .trim()
    .min(1, "Proposal name is required")
    .max(200, "Proposal name cannot exceed 200 characters"),
  // customerId is optional at creation time — SEs often spin up a
  // proposal before the customer record exists. Empty string →
  // null; otherwise must be a UUID.
  customerId: z
    .union([z.literal(""), z.uuid("Invalid customer selection")])
    .optional(),
});

export type NewProposalInput = z.infer<typeof newProposalSchema>;
