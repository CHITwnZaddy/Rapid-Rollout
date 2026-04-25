import {
  calculateMigrationTotals,
  type MigrationConfig,
  type MigrationTotals,
} from "@/lib/calculations/migration-engine";
import { NUM } from "@/lib/calculations/num";
import { toEngineLine } from "@/lib/calculations/adapters";

export type MigrationConfigState = {
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
};

export type MigrationLineState = {
  id: string;
  section: string;
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
  row_order: number;
};

export type MigrationRateInputs = {
  srImRate: number | null;
  pmRate: number | null;
  travelRate: number | null;
  internalCostRate: number | null;
};

export function computeMigrationTotalsFromState(
  config: MigrationConfigState | null,
  lines: MigrationLineState[],
  rates: MigrationRateInputs
): MigrationTotals | null {
  if (
    !config ||
    rates.srImRate == null ||
    rates.pmRate == null ||
    rates.travelRate == null ||
    rates.internalCostRate == null
  ) {
    return null;
  }

  const numProjects = NUM(config.num_projects);
  const migrationConfig: MigrationConfig = {
    num_projects: numProjects,
    hrs_per_import: NUM(config.hrs_per_import),
    lines_per_import_file: NUM(config.lines_per_import_file),
    is_effort_included: config.is_effort_included,
    is_workshop_included: config.is_workshop_included,
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

  const projectLines = lines
    .filter((line) => line.section === "project")
    .map((line) => toEngineLine(line, { quantityOverride: numProjects }));
  const workflowLines = lines
    .filter((line) => line.section === "workflow")
    .map((line) => toEngineLine(line));
  const costLines = lines
    .filter((line) => line.section === "cost")
    .map((line) => toEngineLine(line));

  return calculateMigrationTotals(
    migrationConfig,
    projectLines,
    workflowLines,
    costLines,
    rates.srImRate,
    rates.pmRate,
    rates.travelRate,
    rates.internalCostRate
  );
}
