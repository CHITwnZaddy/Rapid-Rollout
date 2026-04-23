import { applyComplexity } from "@/lib/calculations/complexity";
import { toEngineLine } from "@/lib/calculations/adapters";
import {
  calculateMigrationTotals,
  type MigrationDetailLine,
  type MigrationConfig as EngineMigrationConfig,
} from "@/lib/calculations/migration-engine";
import { NUM } from "@/lib/calculations/num";
import {
  BA_RATE_KEY,
  PM_RATE_KEY,
  SCOPED_KEY_BA,
  SCOPED_KEY_PM,
  SCOPED_KEY_SR_IM,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";

export {
  BA_RATE_KEY,
  PM_RATE_KEY,
  SCOPED_KEY_BA,
  SCOPED_KEY_PM,
  SCOPED_KEY_SR_IM,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
};

export type ScenarioCostRow = {
  proposal_id: string;
  scenario_type: string;
  summary_total_cost: unknown;
  complexity_factor: unknown;
};

export type ScenarioTotalRow = {
  proposal_id: string;
  summary_total_cost: unknown;
  complexity_factor: unknown;
};

export type ScopedCostRow = {
  proposal_id: string;
  cost: unknown;
};

export type ScopedHoursRow = {
  proposal_id: string;
  hours: unknown;
  rate_card_lookup_key: string | null;
};

export type MigrationConfigRow = {
  proposal_id: string;
  num_projects: unknown;
  hrs_per_import: unknown;
  lines_per_import_file: unknown;
  is_effort_included: boolean;
  is_workshop_included: boolean;
  sr_im_complexity_factor: unknown;
  pm_complexity_factor: unknown;
  sr_im_trips: unknown;
  pm_trips: unknown;
  doc_avg_mb_per_project: unknown;
  doc_mb_per_hour: unknown;
  core_requirements_hrs: unknown;
  core_migration_plan_hrs: unknown;
  core_validation_hrs: unknown;
  core_final_qa_hrs: unknown;
  core_pm_oversight_hrs: unknown;
};

export type MigrationLineRow = {
  proposal_id: string;
  id?: string | null;
  section: string;
  label: string;
  quantity: unknown;
  items_per_object: unknown;
  total_line_items: unknown;
  row_order?: number | null;
};

type ScopedHours = {
  sr: number;
  pm: number;
  ba: number;
};

type MigrationHours = {
  pm: number;
  srIm: number;
};

function toEngineConfig(config: MigrationConfigRow): EngineMigrationConfig {
  return {
    num_projects: NUM(config.num_projects),
    hrs_per_import: NUM(config.hrs_per_import),
    lines_per_import_file: NUM(config.lines_per_import_file),
    is_effort_included: config.is_effort_included,
    is_workshop_included: config.is_workshop_included,
    pm_contingency_pct: 0,
    sr_im_complexity_factor: NUM(config.sr_im_complexity_factor),
    pm_complexity_factor: NUM(config.pm_complexity_factor),
    sr_im_trips: NUM(config.sr_im_trips),
    pm_trips: NUM(config.pm_trips),
    doc_avg_mb_per_project: NUM(config.doc_avg_mb_per_project),
    doc_mb_per_hour: NUM(config.doc_mb_per_hour),
    core_requirements_hrs: NUM(config.core_requirements_hrs),
    core_migration_plan_hrs: NUM(config.core_migration_plan_hrs),
    core_validation_hrs: NUM(config.core_validation_hrs),
    core_final_qa_hrs: NUM(config.core_final_qa_hrs),
    core_pm_oversight_hrs: NUM(config.core_pm_oversight_hrs),
  };
}

function buildMigrationLines(
  config: MigrationConfigRow,
  lines: MigrationLineRow[]
): {
  projectLines: MigrationDetailLine[];
  workflowLines: MigrationDetailLine[];
  costLines: MigrationDetailLine[];
} {
  const numProjects = NUM(config.num_projects);

  return {
    projectLines: lines
      .filter((line) => line.section === "project")
      .map((line) => toEngineLine(line, { quantityOverride: numProjects })),
    workflowLines: lines
      .filter((line) => line.section === "workflow")
      .map((line) => toEngineLine(line)),
    costLines: lines
      .filter((line) => line.section === "cost")
      .map((line) => toEngineLine(line)),
  };
}

function groupMigrationLinesByProposal(
  lines: MigrationLineRow[]
): Map<string, MigrationLineRow[]> {
  const grouped = new Map<string, MigrationLineRow[]>();
  for (const line of lines) {
    if (!grouped.has(line.proposal_id)) {
      grouped.set(line.proposal_id, []);
    }
    grouped.get(line.proposal_id)!.push(line);
  }
  return grouped;
}

export function buildScenarioCostMap(
  rows: ScenarioCostRow[]
): Map<string, Record<string, number>> {
  const scenarioMap = new Map<string, Record<string, number>>();

  for (const row of rows) {
    if (!scenarioMap.has(row.proposal_id)) {
      scenarioMap.set(row.proposal_id, {});
    }

    scenarioMap.get(row.proposal_id)![row.scenario_type] = applyComplexity(
      NUM(row.summary_total_cost),
      NUM(row.complexity_factor) || 1
    );
  }

  return scenarioMap;
}

export function buildScenarioTotalByProposal(
  rows: ScenarioTotalRow[]
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const row of rows) {
    totals.set(
      row.proposal_id,
      (totals.get(row.proposal_id) ?? 0) +
        applyComplexity(NUM(row.summary_total_cost), NUM(row.complexity_factor) || 1)
    );
  }

  return totals;
}

export function buildScopedCostMap(
  rows: ScopedCostRow[]
): Map<string, number> {
  const scopedMap = new Map<string, number>();

  for (const row of rows) {
    scopedMap.set(
      row.proposal_id,
      (scopedMap.get(row.proposal_id) ?? 0) + NUM(row.cost)
    );
  }

  return scopedMap;
}

export function buildScopedHoursMap(
  rows: ScopedHoursRow[]
): Map<string, ScopedHours> {
  const scopedMap = new Map<string, ScopedHours>();

  for (const row of rows) {
    const aggregate = scopedMap.get(row.proposal_id) ?? { sr: 0, pm: 0, ba: 0 };
    const hours = NUM(row.hours);

    if (row.rate_card_lookup_key === SCOPED_KEY_SR_IM) aggregate.sr += hours;
    else if (row.rate_card_lookup_key === SCOPED_KEY_PM) aggregate.pm += hours;
    else if (row.rate_card_lookup_key === SCOPED_KEY_BA) aggregate.ba += hours;

    scopedMap.set(row.proposal_id, aggregate);
  }

  return scopedMap;
}

export function buildRateMap(
  rows: { lookup_key: string; rate: unknown }[]
): Map<string, number> {
  return new Map(rows.map((row) => [row.lookup_key, NUM(row.rate)]));
}

function requireMigrationRates(rates: Map<string, number>): {
  srImRate: number;
  pmRate: number;
  travelRate: number;
} {
  const srImRate = rates.get(SR_IM_RATE_KEY);
  const pmRate = rates.get(PM_RATE_KEY);
  const travelRate = rates.get(TRAVEL_RATE_KEY);

  if (srImRate == null || pmRate == null || travelRate == null) {
    throw new Error(
      "Migration report totals unavailable: missing required rate cards (Sr. Implementation Manager, Program Manager, Travel Cost/Trip)."
    );
  }

  return { srImRate, pmRate, travelRate };
}

export function buildMigrationCostMap(
  configs: MigrationConfigRow[],
  lines: MigrationLineRow[],
  rates: Map<string, number>
): Map<string, number> {
  const groupedLines = groupMigrationLinesByProposal(lines);
  const costMap = new Map<string, number>();
  const { srImRate, pmRate, travelRate } = requireMigrationRates(rates);

  for (const config of configs) {
    const proposalLines = groupedLines.get(config.proposal_id) ?? [];
    const { projectLines, workflowLines, costLines } = buildMigrationLines(
      config,
      proposalLines
    );
    costMap.set(
      config.proposal_id,
      calculateMigrationTotals(
        toEngineConfig(config),
        projectLines,
        workflowLines,
        costLines,
        srImRate,
        pmRate,
        travelRate
      ).salesPrice
    );
  }

  return costMap;
}

export function buildMigrationHoursMap(
  configs: MigrationConfigRow[],
  lines: MigrationLineRow[],
  rates: Map<string, number>
): Map<string, MigrationHours> {
  const groupedLines = groupMigrationLinesByProposal(lines);
  const hoursMap = new Map<string, MigrationHours>();
  const { srImRate, pmRate, travelRate } = requireMigrationRates(rates);

  for (const config of configs) {
    const proposalLines = groupedLines.get(config.proposal_id) ?? [];
    const { projectLines, workflowLines, costLines } = buildMigrationLines(
      config,
      proposalLines
    );
    const totals = calculateMigrationTotals(
      toEngineConfig(config),
      projectLines,
      workflowLines,
      costLines,
      srImRate,
      pmRate,
      travelRate
    );

    hoursMap.set(config.proposal_id, {
      pm: totals.totalPmHours,
      srIm: totals.totalSrImHours,
    });
  }

  return hoursMap;
}
