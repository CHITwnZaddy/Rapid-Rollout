import { describe, expect, it } from "vitest";
import {
  buildScenarioGridTotalsUpdate,
  buildScenarioGridUpsertPayload,
  type ScenarioGridPersistLine,
} from "@/lib/scenarios/persist-scenario-grid";

const lineFixture: ScenarioGridPersistLine = {
  id: "line-1",
  rowOrder: 0,
  module: "Module A",
  scopeSelection: "Standard",
  srImHours: 10,
  srImCost: 1000,
  pmHours: 2,
  pmCost: 200,
  baHours: 1,
  baCost: 100,
  totalHours: 13,
  totalCost: 1300,
};

describe("scenario grid persistence helpers", () => {
  it("builds the scenario line upsert payload", () => {
    expect(buildScenarioGridUpsertPayload("scenario-1", [lineFixture])).toEqual(
      [
        {
          id: "line-1",
          scenario_id: "scenario-1",
          row_order: 0,
          module: "Module A",
          scope_selection: "Standard",
          sr_im_hours: 10,
          sr_im_cost: 1000,
          pm_hours: 2,
          pm_cost: 200,
          ba_hours: 1,
          ba_cost: 100,
          total_hours: 13,
          total_cost: 1300,
        },
      ],
    );
  });

  it("builds the scenario totals update payload", () => {
    expect(buildScenarioGridTotalsUpdate([lineFixture])).toEqual({
      summary_total_hours: 13,
      summary_total_cost: 1300,
    });
  });

  it("handles an empty line set when building totals", () => {
    expect(buildScenarioGridTotalsUpdate([])).toEqual({
      summary_total_hours: 0,
      summary_total_cost: 0,
    });
  });
});
