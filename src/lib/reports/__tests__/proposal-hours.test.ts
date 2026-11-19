import { describe, expect, it } from "vitest";
import {
  buildProposalHoursRows,
  proposalHoursRowId,
} from "../proposal-hours";
import type { HoursScenarioLineRow, HoursScenarioRow } from "../data";
import { SCENARIO_ORDER } from "@/lib/scenarios/display";

// Every proposal is bootstrapped with all six scenarios (P1..Opt3).
function allScenarios(proposalId: string, prefix: string): HoursScenarioRow[] {
  return SCENARIO_ORDER.map((type) => ({
    id: `${prefix}-${type}`,
    proposal_id: proposalId,
    scenario_type: type,
  }));
}

const proposals = [
  // Deliberately out of name order: rows are sorted by proposal name.
  { id: "B", name: "Beta", customer_id: null },
  { id: "A", name: "Alpha", customer_id: "c1" },
];

const customerNames = new Map([["c1", "Acme"]]);

const scenarioRows: HoursScenarioRow[] = [
  ...allScenarios("A", "a"),
  ...allScenarios("B", "b"),
];

const scenarioLineRows: HoursScenarioLineRow[] = [
  { scenario_id: "a-P1", sr_im_hours: "10", pm_hours: 2, ba_hours: null },
  { scenario_id: "a-P1", sr_im_hours: 5, pm_hours: 0, ba_hours: 1 },
  { scenario_id: "a-P2", sr_im_hours: 0, pm_hours: 0, ba_hours: 0 },
  { scenario_id: "b-P1", sr_im_hours: "0", pm_hours: "0", ba_hours: "0" },
];

const scopedHours = new Map([
  ["A", { sr: 1, pm: 0, ba: 0 }],
  ["B", { sr: 0, pm: 0, ba: 0 }],
]);

const migrationHours = new Map([["A", { pm: 3, srIm: 4 }]]);

function build(selectedScenario = "All") {
  return buildProposalHoursRows({
    proposals,
    customerNames,
    scenarioRows,
    scenarioLineRows,
    scopedHours,
    migrationHours,
    selectedScenario,
  });
}

describe("buildProposalHoursRows", () => {
  it("omits zero-hour scenarios and proposals with no hours", () => {
    const rows = build();

    expect(rows.map((r) => r.id)).toEqual([
      "A:P1",
      "A:Scoped Services",
      "A:Migration Services",
    ]);
    expect(rows[0]).toMatchObject({
      proposalId: "A",
      proposalName: "Alpha",
      customerName: "Acme",
      scenarioLabel: "Phase 1",
      srImHours: 15,
      pmHours: 2,
      baHours: 1,
      totalHours: 18,
    });
    expect(rows[2]).toMatchObject({
      srImHours: 4,
      pmHours: 3,
      baHours: 0,
      totalHours: 7,
    });
  });

  it("every row id is unique while proposalId links to the proposal", () => {
    const rows = build();

    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => r.proposalId === "A")).toBe(true);
    expect(proposalHoursRowId("A", "P1")).toBe("A:P1");
  });

  it("keeps a non-P1 scenario that has hours", () => {
    const rows = buildProposalHoursRows({
      proposals: [{ id: "A", name: "Alpha", customer_id: "c-missing" }],
      customerNames,
      scenarioRows: allScenarios("A", "a"),
      scenarioLineRows: [
        { scenario_id: "a-Opt1", sr_im_hours: 0, pm_hours: 0, ba_hours: 6 },
      ],
      scopedHours: new Map(),
      migrationHours: new Map(),
      selectedScenario: "All",
    });

    expect(rows.map((r) => r.id)).toEqual(["A:Opt1"]);
    expect(rows[0]).toMatchObject({
      proposalId: "A",
      customerName: "—",
      scenarioLabel: "Option 1",
      baHours: 6,
      totalHours: 6,
    });
  });

  it("scenario filter applies after suppression", () => {
    expect(build("P1").map((r) => r.id)).toEqual(["A:P1"]);
    expect(build("P2").map((r) => r.id)).toEqual([]);
    expect(build("Scoped Services").map((r) => r.id)).toEqual([
      "A:Scoped Services",
    ]);
  });
});
