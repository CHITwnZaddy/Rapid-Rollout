import {
  calculateMigrationTotals,
  validImportCapacity,
  type MigrationConfig,
  type MigrationTotals,
} from "@/lib/calculations/migration-engine";
import { NUM } from "@/lib/calculations/num";
import { hasMigrationSection, toEngineLine } from "@/lib/calculations/adapters";

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
  const linesPerImportFile = NUM(config.lines_per_import_file);
  if (validImportCapacity(linesPerImportFile) === null) {
    return null;
  }

  const migrationConfig: MigrationConfig = {
    num_projects: numProjects,
    hrs_per_import: NUM(config.hrs_per_import),
    lines_per_import_file: linesPerImportFile,
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
    .filter((line) => hasMigrationSection(line, "project"))
    .map((line) => toEngineLine(line, { quantityOverride: numProjects }));
  const workflowLines = lines
    .filter((line) => hasMigrationSection(line, "workflow"))
    .map((line) => toEngineLine(line));
  const costLines = lines
    .filter((line) => hasMigrationSection(line, "cost"))
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

type MigrationConfigRow = {
  num_projects: number | null;
  hrs_per_import: number | null;
  lines_per_import_file: number | null;
  is_effort_included: boolean | null;
  is_workshop_included: boolean | null;
  complexity_factor: number | null;
  sr_im_trips: number | null;
  pm_trips: number | null;
  doc_avg_mb_per_project: number | null;
  doc_mb_per_hour: number | null;
  core_requirements_hrs: number | null;
  core_migration_plan_hrs: number | null;
  core_validation_hrs: number | null;
  core_final_qa_hrs: number | null;
  core_pm_oversight_hrs: number | null;
};

type MigrationLineRow = {
  id: string;
  section: string;
  label: string;
  quantity: number | null;
  items_per_object: number | null;
  total_line_items: number | null;
  row_order: number | null;
};

// Server-side live migration recompute shared by fetchProposalSubtotal and the
// proposal summary page, which previously inlined identical copies. Takes the
// raw migration_config + migration_detail_lines rows and the four required
// rates (callers fail closed on missing rates BEFORE calling this), and returns
// the full MigrationTotals. Unlike computeMigrationTotalsFromState, it does NOT
// short-circuit on invalid import capacity — it mirrors the server pages'
// existing behaviour of always computing (calculateMigrationTotals handles a
// missing capacity per line).
export function computeProposalMigrationTotal(
  configRow: MigrationConfigRow | null,
  lineRows: MigrationLineRow[],
  rates: {
    srImRate: number;
    pmRate: number;
    travelRate: number;
    internalCostRate: number;
  }
): MigrationTotals | null {
  if (!configRow) return null;

  const numProjects = NUM(configRow.num_projects);
  const config: MigrationConfig = {
    num_projects: numProjects,
    hrs_per_import: NUM(configRow.hrs_per_import),
    lines_per_import_file: NUM(configRow.lines_per_import_file),
    is_effort_included: configRow.is_effort_included ?? false,
    is_workshop_included: configRow.is_workshop_included ?? false,
    complexity_factor: NUM(configRow.complexity_factor),
    sr_im_trips: NUM(configRow.sr_im_trips),
    pm_trips: NUM(configRow.pm_trips),
    doc_avg_mb_per_project: NUM(configRow.doc_avg_mb_per_project),
    doc_mb_per_hour: NUM(configRow.doc_mb_per_hour),
    core_requirements_hrs: NUM(configRow.core_requirements_hrs),
    core_migration_plan_hrs: NUM(configRow.core_migration_plan_hrs),
    core_validation_hrs: NUM(configRow.core_validation_hrs),
    core_final_qa_hrs: NUM(configRow.core_final_qa_hrs),
    core_pm_oversight_hrs: NUM(configRow.core_pm_oversight_hrs),
  };

  const projectLines = lineRows
    .filter((line) => hasMigrationSection(line, "project"))
    .map((line) => toEngineLine(line, { quantityOverride: numProjects }));
  const workflowLines = lineRows
    .filter((line) => hasMigrationSection(line, "workflow"))
    .map((line) => toEngineLine(line));
  const costLines = lineRows
    .filter((line) => hasMigrationSection(line, "cost"))
    .map((line) => toEngineLine(line));

  return calculateMigrationTotals(
    config,
    projectLines,
    workflowLines,
    costLines,
    rates.srImRate,
    rates.pmRate,
    rates.travelRate,
    rates.internalCostRate
  );
}
