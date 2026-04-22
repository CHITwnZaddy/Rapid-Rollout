import { describe, it, expect } from "vitest";
import {
  buildScenarioBreakoutRows,
  scenarioBreakoutFileName,
  type ScenarioBreakoutExportInput,
} from "../scenario-breakout";

const baseInput: ScenarioBreakoutExportInput = {
  proposalName: "Acme Corp",
  scenarioGroups: [],
  scopedLines: [],
  migrationRows: [],
  migrationGrandTotal: 0,
};

describe("buildScenarioBreakoutRows", () => {
  it("returns empty rows for an empty report", () => {
    expect(buildScenarioBreakoutRows(baseInput)).toEqual([]);
  });

  it("emits a row per line and a subtotal row per scenario", () => {
    const rows = buildScenarioBreakoutRows({
      ...baseInput,
      scenarioGroups: [
        {
          scenarioType: "P1",
          lines: [
            { module: "Financials", scope_selection: "Small", total_cost: 1000 },
            { module: "Project Mgmt", scope_selection: null, total_cost: 500 },
          ],
          totalCost: 1500,
        },
      ],
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      Section: "P1",
      Item: "Financials",
      Detail: "Small",
      Subtotal: 1000,
    });
    expect(rows[1]).toEqual({
      Section: "P1",
      Item: "Project Mgmt",
      Detail: "",
      Subtotal: 500,
    });
    expect(rows[2]).toEqual({
      Section: "P1 Total",
      Item: "",
      Detail: "",
      Subtotal: 1500,
    });
  });

  it("adds scoped services section with its own total row", () => {
    const rows = buildScenarioBreakoutRows({
      ...baseInput,
      scopedLines: [
        { service_type: "Training", description: "On-site", cost: 800 },
        { service_type: "Data prep", description: null, cost: 200 },
      ],
    });
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual({
      Section: "Scoped Services Total",
      Item: "",
      Detail: "",
      Subtotal: 1000,
    });
  });

  it("appends migration service rows", () => {
    const rows = buildScenarioBreakoutRows({
      ...baseInput,
      migrationRows: [
        { label: "Core Data Migration Efforts", total: 1200 },
        { label: "Document Migration", total: 3000 },
      ],
    });
    expect(rows).toEqual([
      {
        Section: "Migration Services",
        Item: "Core Data Migration Efforts",
        Detail: "",
        Subtotal: 1200,
      },
      {
        Section: "Migration Services",
        Item: "Document Migration",
        Detail: "",
        Subtotal: 3000,
      },
      {
        Section: "Migration Services Total",
        Item: "",
        Detail: "",
        Subtotal: 4200,
      },
    ]);
  });

  it("handles non-numeric migration totals safely", () => {
    const rows = buildScenarioBreakoutRows({
      ...baseInput,
      migrationRows: [
        { label: "Core Data Migration Efforts", total: NaN as unknown as number },
      ],
    });
    expect(rows[0].Subtotal).toBe(0);
  });

  it("omits scoped services total row when empty", () => {
    const rows = buildScenarioBreakoutRows({
      ...baseInput,
      scenarioGroups: [
        { scenarioType: "P1", lines: [], totalCost: 0 },
      ],
    });
    // No scoped services section at all when scopedLines is empty
    expect(rows.find((r) => r.Section === "Scoped Services Total")).toBeUndefined();
  });
});

describe("scenarioBreakoutFileName", () => {
  it("includes proposal name and ISO date", () => {
    const name = scenarioBreakoutFileName("Acme");
    expect(name).toMatch(/^scenario-breakout-Acme-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
