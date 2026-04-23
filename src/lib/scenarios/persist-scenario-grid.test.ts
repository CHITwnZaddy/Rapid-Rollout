import { describe, expect, it } from "vitest";
import {
  buildCanonicalScenarioGridLines,
  buildScenarioGridRpcPayload,
  buildScenarioGridTotalsUpdate,
  buildScenarioGridUpsertPayload,
  type ScenarioGridChangeInput,
  type ScenarioGridExistingLine,
  type ScenarioGridPersistLine,
} from "@/lib/scenarios/persist-scenario-grid";
import {
  buildRateCardMap,
  buildServiceHoursMap,
  type RateCardRow,
  type ServiceHoursRow,
} from "@/lib/calculations/engine";

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

const existingLineFixture: ScenarioGridExistingLine = {
  id: "line-1",
  rowOrder: 0,
  module: "Module A",
  scopeSelection: "Standard",
};

const serviceHoursFixture: ServiceHoursRow[] = [
  {
    service_name: "Module A",
    scope_value: "Standard",
    sr_im_hours: 10,
    pm_hours: 2,
    ba_hours: 1,
    scope_label: "Standard",
    service_group: "Core",
    lookup_key: "Module A|Standard",
  },
  {
    service_name: "Module A",
    scope_value: "Advanced",
    sr_im_hours: 14,
    pm_hours: 3,
    ba_hours: 0,
    scope_label: "Advanced",
    service_group: "Core",
    lookup_key: "Module A|Advanced",
  },
];

const rateCardsFixture: RateCardRow[] = [
  {
    activity: "Sr. Implementation Manager",
    rate: 100,
    role_category: "Labor",
    lookup_key: "Master|Sr. Implementation Manager",
  },
  {
    activity: "Program Manager",
    rate: 150,
    role_category: "Labor",
    lookup_key: "Master|Program Manager",
  },
  {
    activity: "Business Analyst",
    rate: 50,
    role_category: "Labor",
    lookup_key: "Master|Business Analyst",
  },
];

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

  it("builds canonical scenario lines from changed scope selections", () => {
    const changes: ScenarioGridChangeInput[] = [
      { lineId: "line-1", scopeSelection: "Advanced" },
    ];

    expect(
      buildCanonicalScenarioGridLines(
        [existingLineFixture],
        changes,
        buildServiceHoursMap(serviceHoursFixture),
        buildRateCardMap(rateCardsFixture)
      )
    ).toEqual([
      {
        id: "line-1",
        rowOrder: 0,
        module: "Module A",
        scopeSelection: "Advanced",
        srImHours: 14,
        srImCost: 1400,
        pmHours: 3,
        pmCost: 450,
        baHours: 0,
        baCost: 0,
        totalHours: 17,
        totalCost: 1850,
      },
    ]);
  });

  it("rejects invalid scope selections for a module", () => {
    expect(() =>
      buildCanonicalScenarioGridLines(
        [existingLineFixture],
        [{ lineId: "line-1", scopeSelection: "Definitely Invalid" }],
        buildServiceHoursMap(serviceHoursFixture),
        buildRateCardMap(rateCardsFixture)
      )
    ).toThrow(
      'Invalid scope selection "Definitely Invalid" for module "Module A".'
    );
  });

  it("builds the compact RPC payload from canonical lines", () => {
    expect(buildScenarioGridRpcPayload([lineFixture])).toEqual([
      {
        id: "line-1",
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
    ]);
  });
});
