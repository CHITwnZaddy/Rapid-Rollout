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
