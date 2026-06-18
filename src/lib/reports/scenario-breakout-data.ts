import type { SupabaseClient } from "@supabase/supabase-js";
import { hasMigrationSection, toEngineLine } from "@/lib/calculations/adapters";
import { applyComplexity } from "@/lib/calculations/complexity";
import {
  calculateMigrationTotals,
  type MigrationConfig as EngineMigrationConfig,
} from "@/lib/calculations/migration-engine";
import { NUM } from "@/lib/calculations/num";
import {
  buildScenarioBreakoutMigrationRows,
  type MigrationBreakdownRow,
} from "@/lib/reports/migration-breakdown";
import { SCENARIO_ORDER } from "@/lib/scenarios/display";

export type ScenarioBreakoutClient = Pick<SupabaseClient, "from">;

export type Proposal = {
  id: string;
  name: string;
};

export type ScenarioLine = {
  module: string;
  scope_selection: string | null;
  total_cost: number;
};

export type ScenarioGroup = {
  scenarioType: string;
  lines: ScenarioLine[];
  totalCost: number;
};

export type ScopedLine = {
  service_type: string;
  description: string | null;
  cost: number;
};

export type MigrationConfig = {
  num_projects: number;
  hrs_per_import: number;
  lines_per_import_file: number;
  is_effort_included: boolean;
  is_workshop_included: boolean;
  complexity_factor: number;
  sr_im_trips: number;
  pm_trips: number;
  doc_avg_mb_per_project: number;
  doc_mb_per_hour: number;
  core_requirements_hrs: number;
  core_migration_plan_hrs: number;
  core_validation_hrs: number;
  core_final_qa_hrs: number;
  core_pm_oversight_hrs: number;
  computed_total_cost: number;
};

export type MigrationLine = {
  section: string;
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
};

export type ScenarioBreakoutRates = {
  srImRate: number;
  pmRate: number;
  travelRate: number;
  internalCostRate: number;
};

export type ScenarioBreakoutDataResult =
  | {
      ok: true;
      scenarioGroups: ScenarioGroup[];
      scopedLines: ScopedLine[];
      migrationConfig: MigrationConfig | null;
      migrationLines: MigrationLine[];
      migrationBreakdownRows: MigrationBreakdownRow[];
      migrationLiveTotal: number;
    }
  | { ok: false; error: string };

type QueryError = { message?: string } | null;
type QueryResult<T> = {
  data: T | null;
  error?: QueryError;
};

type ScenarioRow = {
  id: string;
  scenario_type: string;
  summary_total_cost: unknown;
  complexity_factor: unknown;
};

type ScenarioLineRow = {
  scenario_id: string;
  module: string;
  scope_selection: string | null;
  total_cost: unknown;
};

type ScopedServiceRow = {
  service_type: string;
  description: string | null;
  cost: unknown;
};

type ProposalRow = {
  scoped_complexity_factor: unknown;
};

const MIGRATION_CONFIG_COLUMNS =
  "num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, complexity_factor, sr_im_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs, computed_total_cost";

function queryError(
  result: { error?: QueryError },
  label: string
): string | null {
  return result.error
    ? `${label} failed to load. ${result.error.message ?? "Unknown error."}`
    : null;
}

function requiredRowError<T>(
  result: QueryResult<T>,
  label: string
): string | null {
  return (
    queryError(result, label) ??
    (result.data == null ? `${label} failed to load. No data returned.` : null)
  );
}

function toEngineConfig(config: MigrationConfig): EngineMigrationConfig {
  return {
    num_projects: NUM(config.num_projects),
    hrs_per_import: NUM(config.hrs_per_import),
    lines_per_import_file: NUM(config.lines_per_import_file),
    is_effort_included: config.is_effort_included ?? false,
    is_workshop_included: config.is_workshop_included ?? false,
    complexity_factor: NUM(config.complexity_factor),
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

function calculateMigrationLiveTotal(
  config: MigrationConfig,
  lines: MigrationLine[],
  rates: ScenarioBreakoutRates
): number {
  const numProjects = NUM(config.num_projects);
  const projectLines = lines
    .filter((line) => hasMigrationSection(line, "project"))
    .map((line) => toEngineLine(line, { quantityOverride: numProjects }));
  const workflowLines = lines
    .filter((line) => hasMigrationSection(line, "workflow"))
    .map((line) => toEngineLine(line));
  const costLines = lines
    .filter((line) => hasMigrationSection(line, "cost"))
    .map((line) => toEngineLine(line));

  return calculateMigrationTotals(
    toEngineConfig(config),
    projectLines,
    workflowLines,
    costLines,
    rates.srImRate,
    rates.pmRate,
    rates.travelRate,
    rates.internalCostRate
  ).clientPrice;
}

function failureFromUnknown(error: unknown): ScenarioBreakoutDataResult {
  return {
    ok: false,
    error:
      error instanceof Error
        ? error.message
        : "Scenario breakout report failed to load.",
  };
}

export async function loadScenarioBreakoutData(
  supabase: ScenarioBreakoutClient,
  proposalId: string,
  rates: ScenarioBreakoutRates
): Promise<ScenarioBreakoutDataResult> {
  try {
    const scenarioRes = (await supabase
      .from("scenarios")
      .select("id, scenario_type, summary_total_cost, complexity_factor")
      .eq("proposal_id", proposalId)
      .order("scenario_type")) as QueryResult<ScenarioRow[]>;
    const scenarioLoadError = queryError(scenarioRes, "Scenarios");
    if (scenarioLoadError) return { ok: false, error: scenarioLoadError };

    const scenarios = scenarioRes.data ?? [];
    const scenarioIds = scenarios.map((scenario) => scenario.id);
    const scenarioLineQuery =
      scenarioIds.length > 0
        ? supabase
            .from("scenario_lines")
            .select("scenario_id, module, scope_selection, total_cost")
            .in("scenario_id", scenarioIds)
            .order("row_order")
        : Promise.resolve({ data: [], error: null });

    const [
      linesRes,
      scopedRes,
      migrationConfigRes,
      migrationLinesRes,
      proposalRes,
    ] = await Promise.all([
      scenarioLineQuery as PromiseLike<QueryResult<ScenarioLineRow[]>>,
      supabase
        .from("scoped_services")
        .select("service_type, description, cost")
        .eq("proposal_id", proposalId)
        .order("row_order") as PromiseLike<QueryResult<ScopedServiceRow[]>>,
      supabase
        .from("migration_config")
        .select(MIGRATION_CONFIG_COLUMNS)
        .eq("proposal_id", proposalId)
        .maybeSingle() as PromiseLike<QueryResult<MigrationConfig>>,
      supabase
        .from("migration_detail_lines")
        .select("section, label, quantity, items_per_object, total_line_items")
        .eq("proposal_id", proposalId)
        .order("section")
        .order("row_order") as PromiseLike<QueryResult<MigrationLine[]>>,
      supabase
        .from("proposals")
        .select("scoped_complexity_factor")
        .eq("id", proposalId)
        .single() as PromiseLike<QueryResult<ProposalRow>>,
    ]);

    const lineLoadError = queryError(linesRes, "Scenario lines");
    if (lineLoadError) return { ok: false, error: lineLoadError };
    const scopedLoadError = queryError(scopedRes, "Scoped services");
    if (scopedLoadError) return { ok: false, error: scopedLoadError };
    const configLoadError = queryError(
      migrationConfigRes,
      "Migration configuration"
    );
    if (configLoadError) return { ok: false, error: configLoadError };
    const migrationLinesLoadError = queryError(
      migrationLinesRes,
      "Migration detail lines"
    );
    if (migrationLinesLoadError) {
      return { ok: false, error: migrationLinesLoadError };
    }
    const proposalLoadError = requiredRowError(proposalRes, "Proposal");
    if (proposalLoadError) return { ok: false, error: proposalLoadError };

    const allLines = linesRes.data ?? [];
    const scenarioIdMap = new Map(
      scenarios.map((scenario) => [scenario.id, scenario.scenario_type])
    );
    const scenarioFactorMap = new Map(
      scenarios.map((scenario) => [
        scenario.id,
        NUM(scenario.complexity_factor) || 1,
      ])
    );
    const scenarioGroups = SCENARIO_ORDER.flatMap((type): ScenarioGroup[] => {
      const scenario = scenarios.find((row) => row.scenario_type === type);
      if (!scenario) return [];
      const scenarioFactor = scenarioFactorMap.get(scenario.id) ?? 1;
      const lines = allLines
        .filter((line) => scenarioIdMap.get(line.scenario_id) === type)
        .filter((line) => NUM(line.total_cost) > 0)
        .map((line) => ({
          module: line.module,
          scope_selection: line.scope_selection,
          total_cost: applyComplexity(NUM(line.total_cost), scenarioFactor),
        }));
      return [
        {
          scenarioType: type,
          lines,
          totalCost: applyComplexity(
            NUM(scenario.summary_total_cost),
            scenarioFactor
          ),
        },
      ];
    });

    const scopedFactor = NUM(proposalRes.data!.scoped_complexity_factor) || 1;
    const scopedLines = (scopedRes.data ?? [])
      .filter((line) => NUM(line.cost) > 0)
      .map((line) => ({
        service_type: line.service_type,
        description: line.description,
        cost: applyComplexity(NUM(line.cost), scopedFactor),
      }));

    const migrationConfig = migrationConfigRes.data ?? null;
    const migrationLines = migrationLinesRes.data ?? [];
    const migrationBreakdownRows = migrationConfig
      ? buildScenarioBreakoutMigrationRows(
          migrationConfig,
          migrationLines,
          rates.srImRate,
          rates.pmRate
        )
      : [];
    const migrationLiveTotal = migrationConfig
      ? calculateMigrationLiveTotal(migrationConfig, migrationLines, rates)
      : 0;

    return {
      ok: true,
      scenarioGroups,
      scopedLines,
      migrationConfig,
      migrationLines,
      migrationBreakdownRows,
      migrationLiveTotal,
    };
  } catch (error) {
    return failureFromUnknown(error);
  }
}
