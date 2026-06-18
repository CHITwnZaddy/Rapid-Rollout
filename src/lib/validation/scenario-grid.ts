import { z } from "zod";

export const scenarioGridChangeSchema = z.object({
  lineId: z.uuid("Invalid scenario line id"),
  scopeSelection: z.string().trim().min(1).nullable(),
});

export const saveScenarioGridSchema = z.object({
  proposalId: z.uuid("Invalid proposal id"),
  scenarioId: z.uuid("Invalid scenario id"),
  changes: z
    .array(scenarioGridChangeSchema)
    .min(1, "At least one scenario change is required"),
});
