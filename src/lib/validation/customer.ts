import { z } from "zod";

// Input validation for inline customer creation (New Proposal dialog).
// company_name is the only required field — the customers admin table
// allows the address columns to be filled in later.
export const newCustomerSchema = z.object({
  company_name: z
    .string({ error: "Company name must be text" })
    .trim()
    .min(1, "Company name is required")
    .max(200, "Company name cannot exceed 200 characters"),
  address_line1: z.string().trim().max(200).optional(),
  address_line2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  zip: z.string().trim().max(20).optional(),
});

export type NewCustomerInput = z.infer<typeof newCustomerSchema>;
