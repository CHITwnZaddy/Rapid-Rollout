import { z } from "zod";

export const SCOPED_SERVICE_TYPES = [
  "01 Data Fix",
  "02 Mail Merge",
  "03 Remote Pro Svcs - Design Session(s)",
  "04 Remote Pro Svcs - Requirements Creation",
  "05 Other",
] as const;

export const scopedServiceTypeSchema = z.enum(SCOPED_SERVICE_TYPES, {
  error: "Invalid scoped service type",
});

export const scopedServiceHoursSchema = z
  .number({ error: "Hours must be a number" })
  .finite("Hours must be a finite number")
  .min(0, "Hours cannot be negative");

export const scopedServiceDescriptionSchema = z
  .string({ error: "Description must be text" })
  .max(5000, "Description cannot exceed 5000 characters");

export const scopedServiceRateCardLookupKeySchema = z
  .string({ error: "Rate card lookup key must be text" })
  .min(1, "Rate card lookup key is required")
  .max(255, "Rate card lookup key is too long");

export const addScopedServiceLineInputSchema = z.object({
  proposalId: z.uuid("Invalid proposal id"),
});

export const updateScopedServiceLineInputSchema = z.object({
  proposalId: z.uuid("Invalid proposal id"),
  lineId: z.uuid("Invalid scoped service line id"),
  serviceType: scopedServiceTypeSchema,
  description: scopedServiceDescriptionSchema,
  hours: scopedServiceHoursSchema,
  rateCardLookupKey: scopedServiceRateCardLookupKeySchema,
});

export const deleteScopedServiceLineInputSchema = z.object({
  proposalId: z.uuid("Invalid proposal id"),
  lineId: z.uuid("Invalid scoped service line id"),
});

// Shape of a scoped_services row as selected by the pricing page and the
// server actions. Nullability mirrors the generated DB types so a renamed or
// retyped column fails validation instead of silently mis-rendering. Shared
// here (not in the "use server" actions file, which can only export async
// functions) so the client page and the actions validate identically.
export const scopedServiceLineRowSchema = z.object({
  id: z.string(),
  service_type: z.string(),
  description: z.string().nullable(),
  hours: z.number(),
  rate_card_lookup_key: z.string(),
  cost: z.number().nullable(),
  row_order: z.number(),
});
export const scopedServiceLineRowsSchema = z.array(scopedServiceLineRowSchema);
