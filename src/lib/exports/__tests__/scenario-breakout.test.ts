import { describe, it, expect } from "vitest";
import {
  buildScenarioBreakoutWorkbook,
  scenarioBreakoutFileName,
} from "../scenario-breakout";

describe("scenarioBreakoutFileName", () => {
  it("includes proposal name and ISO date", () => {
    const name = scenarioBreakoutFileName("Acme");
    expect(name).toMatch(/^scenario-breakout-Acme-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

describe("buildScenarioBreakoutWorkbook", () => {
  it("builds the Scenario Breakout sheet without DOM/Blob APIs", async () => {
    const workbook = await buildScenarioBreakoutWorkbook({
      proposalName: "Acme",
      scenarioGroups: [
        {
          scenarioType: "P1",
          lines: [
            { module: "Financials", scope_selection: "Small", total_cost: 1000 },
          ],
          totalCost: 1000,
        },
      ],
      scopedLines: [{ service_type: "01 Data Fix", description: "x", cost: 250 }],
      migrationRows: [{ label: "Project", total: 500 }],
      migrationGrandTotal: 500,
    });

    const sheet = workbook.getWorksheet("Scenario Breakout");
    expect(sheet).toBeDefined();
    expect(sheet!.rowCount).toBeGreaterThan(0);
  });
});
