import { z } from "zod";

export const migrationSectionSchema = z.enum(["project", "workflow", "cost"]);

export const addMigrationDetailLineSchema = z.object({
  proposalId: z.uuid("Invalid proposal id"),
  section: migrationSectionSchema,
});

export const removeMigrationDetailLineSchema = z.object({
  proposalId: z.uuid("Invalid proposal id"),
  lineId: z.uuid("Invalid migration line id"),
});

export type MigrationSection = z.infer<typeof migrationSectionSchema>;
