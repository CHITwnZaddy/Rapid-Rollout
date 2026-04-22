import { toEngineLine } from "@/lib/calculations/adapters";
import {
  calculateMigrationTotals,
  type MigrationConfig as EngineMigrationConfig,
  type MigrationDetailLine,
} from "@/lib/calculations/migration-engine";
import { NUM } from "@/lib/calculations/num";

export type MigrationBreakdownConfig = {
  num_projects: number;
  hrs_per_import: number;
  lines_per_import_file: number;
  is_effort_included: boolean;
  is_workshop_included: boolean;
  ba_complexity_factor: number;
  pm_complexity_factor: number;
  ba_trips: number;
  pm_trips: number;
  doc_avg_mb_per_project: number;
  doc_mb_per_hour: number;
  core_requirements_hrs: number;
  core_migration_plan_hrs: number;
  core_validation_hrs: number;
  core_final_qa_hrs: number;
  core_pm_oversight_hrs: number;
};

export type MigrationBreakdownLine = {
  section: string;
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
  row_order?: number;
};

export type MigrationBreakdownRow = {
  label: string;
  total: number;
};

export function buildScenarioBreakoutMigrationRows(
  config: MigrationBreakdownConfig,
  lines: MigrationBreakdownLine[],
  srImRate: number,
  pmRate: number
): MigrationBreakdownRow[] {
  const numProjects = NUM(config.num_projects);
  const engineConfig: EngineMigrationConfig = {
    num_projects: numProjects,
    hrs_per_import: NUM(config.hrs_per_import),
    lines_per_import_file: NUM(config.lines_per_import_file),
    is_effort_included: config.is_effort_included,
    is_workshop_included: config.is_workshop_included,
    pm_contingency_pct: 0,
    ba_complexity_factor: NUM(config.ba_complexity_factor),
    pm_complexity_factor: NUM(config.pm_complexity_factor),
    ba_trips: NUM(config.ba_trips),
    pm_trips: NUM(config.pm_trips),
    doc_avg_mb_per_project: NUM(config.doc_avg_mb_per_project),
    doc_mb_per_hour: NUM(config.doc_mb_per_hour),
    core_requirements_hrs: NUM(config.core_requirements_hrs),
    core_migration_plan_hrs: NUM(config.core_migration_plan_hrs),
    core_validation_hrs: NUM(config.core_validation_hrs),
    core_final_qa_hrs: NUM(config.core_final_qa_hrs),
    core_pm_oversight_hrs: NUM(config.core_pm_oversight_hrs),
  };

  const projectLines: MigrationDetailLine[] = lines
    .filter((line) => line.section === "project")
    .map((line) => toEngineLine(line, { quantityOverride: numProjects }));
  const workflowLines: MigrationDetailLine[] = lines
    .filter(
      (line) =>
        line.section === "workflow" &&
        line.label &&
        line.label !== "WF Object Name" &&
        line.label.trim() !== ""
    )
    .map((line) => toEngineLine(line));
  const costLines: MigrationDetailLine[] = lines
    .filter(
      (line) =>
        line.section === "cost" &&
        line.label &&
        line.label !== "TBD" &&
        line.label.trim() !== ""
    )
    .map((line) => toEngineLine(line));

  const totals = calculateMigrationTotals(
    engineConfig,
    projectLines,
    workflowLines,
    costLines,
    srImRate,
    pmRate,
    0
  );

  const rows: MigrationBreakdownRow[] = [];

  if (config.is_effort_included && (totals.coreBa > 0 || totals.corePm > 0)) {
    rows.push({
      label: "Core Data Migration Efforts",
      total: totals.coreBa * srImRate + totals.corePm * pmRate,
    });
  }

  if (totals.documentBa > 0) {
    rows.push({
      label: "Document Migration",
      total: totals.documentBa * srImRate,
    });
  }

  if (totals.projectBa > 0) {
    rows.push({
      label: "Project & Schedule Data Migration",
      total: totals.projectBa * srImRate,
    });
  }

  if (totals.workflowBa > 0) {
    rows.push({
      label: "Workflow Data Migration",
      total: totals.workflowBa * srImRate,
    });
  }

  if (totals.costBa > 0) {
    rows.push({
      label: "Cost Data Migration",
      total: totals.costBa * srImRate,
    });
  }

  return rows;
}

export function calculateMigrationBreakdownTotal(
  rows: MigrationBreakdownRow[]
): number {
  return rows.reduce((sum, row) => sum + row.total, 0);
}
