export type ScenarioGridPersistLine = {
  id: string;
  rowOrder: number;
  module: string;
  scopeSelection: string | null;
  srImHours: number;
  srImCost: number;
  pmHours: number;
  pmCost: number;
  baHours: number;
  baCost: number;
  totalHours: number;
  totalCost: number;
};

export type ScenarioGridUpsertPayload = {
  id: string;
  scenario_id: string;
  row_order: number;
  module: string;
  scope_selection: string | null;
  sr_im_hours: number;
  sr_im_cost: number;
  pm_hours: number;
  pm_cost: number;
  ba_hours: number;
  ba_cost: number;
  total_hours: number;
  total_cost: number;
};

export function buildScenarioGridUpsertPayload(
  scenarioId: string,
  lines: ScenarioGridPersistLine[]
): ScenarioGridUpsertPayload[] {
  return lines.map((line) => ({
    id: line.id,
    scenario_id: scenarioId,
    row_order: line.rowOrder,
    module: line.module,
    scope_selection: line.scopeSelection,
    sr_im_hours: line.srImHours,
    sr_im_cost: line.srImCost,
    pm_hours: line.pmHours,
    pm_cost: line.pmCost,
    ba_hours: line.baHours,
    ba_cost: line.baCost,
    total_hours: line.totalHours,
    total_cost: line.totalCost,
  }));
}

export function buildScenarioGridTotalsUpdate(
  lines: ScenarioGridPersistLine[]
): { summary_total_hours: number; summary_total_cost: number } {
  const totals = lines.reduce(
    (acc, line) => ({
      summary_total_hours: acc.summary_total_hours + line.totalHours,
      summary_total_cost: acc.summary_total_cost + line.totalCost,
    }),
    { summary_total_hours: 0, summary_total_cost: 0 }
  );

  return {
    summary_total_hours: totals.summary_total_hours,
    summary_total_cost: totals.summary_total_cost,
  };
}
