import { describe, expect, it } from "vitest";
import { getScenarioDisplayName, SCENARIO_ORDER } from "./display";

describe("scenario display helpers", () => {
  it("keeps base phases before optional scenarios", () => {
    expect(SCENARIO_ORDER).toEqual(["P1", "P2", "P3", "Opt1", "Opt2", "Opt3"]);
  });

  it("returns human labels for every scenario tab", () => {
    expect(getScenarioDisplayName("P1")).toBe("Phase 1");
    expect(getScenarioDisplayName("P2")).toBe("Phase 2");
    expect(getScenarioDisplayName("P3")).toBe("Phase 3");
    expect(getScenarioDisplayName("Opt3")).toBe("Option 3");
    expect(getScenarioDisplayName("Opt1")).toBe("Option 1");
    expect(getScenarioDisplayName("Opt2")).toBe("Option 2");
  });
});
