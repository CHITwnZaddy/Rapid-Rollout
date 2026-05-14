export const SCENARIO_ORDER = ["P1", "P2", "P3", "P4", "Opt1", "Opt2"] as const;

export type ScenarioType = (typeof SCENARIO_ORDER)[number];

const SCENARIO_DISPLAY_NAMES: Record<ScenarioType, string> = {
  P1: "Phase 1",
  P2: "Phase 2",
  P3: "Phase 3",
  P4: "Phase 4",
  Opt1: "Option 1",
  Opt2: "Option 2",
};

export function getScenarioDisplayName(scenarioType: string): string {
  return SCENARIO_DISPLAY_NAMES[scenarioType as ScenarioType] ?? scenarioType;
}
