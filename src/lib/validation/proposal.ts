import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Proposal form validation
// ─────────────────────────────────────────────────────────────
// Gate the new-proposal form at the client boundary so whitespace-only
// names and malformed customer ids cannot reach Supabase.
// ─────────────────────────────────────────────────────────────

// Shared so the create form and the rename action enforce identical rules.
const proposalNameSchema = z
  .string({ error: "Proposal name is required" })
  .trim()
  .min(1, "Proposal name is required")
  .max(200, "Proposal name cannot exceed 200 characters");

export const newProposalSchema = z.object({
  name: proposalNameSchema,
  // customerId is optional at creation time — SEs often spin up a
  // proposal before the customer record exists. Empty string →
  // null; otherwise must be a UUID.
  customerId: z
    .union([z.literal(""), z.uuid("Invalid customer selection")])
    .optional(),
});

export const renameProposalSchema = z.object({
  name: proposalNameSchema,
});

// ─────────────────────────────────────────────────────────────
// Supabase response schemas
// Used with safeParseSupabaseResult to replace unsafe `as` casts.
// ─────────────────────────────────────────────────────────────

export const ScenarioDataSchema = z.object({
  scenario_type: z.string(),
  summary_total_hours: z.number(),
  summary_total_cost: z.number(),
  complexity_factor: z.number().optional(),
});
export type ScenarioData = z.infer<typeof ScenarioDataSchema>;

// Supabase returns a joined customers row as either an object or a
// single-element array depending on the relationship cardinality — the
// union covers both so the schema doesn't reject valid API responses.
const CustomerNameSchema = z.object({ company_name: z.string() });

export const ProposalListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  customers: z
    .union([CustomerNameSchema, z.array(CustomerNameSchema)])
    .nullable()
    .optional(),
  scenarios: z
    .array(
      z.object({
        scenario_type: z.string(),
        summary_total_cost: z.number(),
        summary_total_hours: z.number(),
        complexity_factor: z.number().optional(),
      })
    )
    .default([]),
});
export type ProposalListItem = z.infer<typeof ProposalListItemSchema>;

export const ProposalListSchema = z.array(ProposalListItemSchema);

export const BidSheetDataSchema = z.object({
  id: z.string(),
  customer_id: z.string().nullable(),
  discount_percent: z.number(),
  discount_dollars: z.number(),
  notes: z.string().nullable(),
});
export type BidSheetData = z.infer<typeof BidSheetDataSchema>;

export const CustomerSchema = z.object({
  id: z.string(),
  company_name: z.string(),
  address_line1: z.string().nullable(),
  address_line2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
});
export type Customer = z.infer<typeof CustomerSchema>;

export const ScopedCostSchema = z.object({ cost: z.number() });
