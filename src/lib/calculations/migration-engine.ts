/**
 * Migration Services Calculation Engine
 *
 * Replicates the Excel "Migration Services" sheet logic:
 * - Project, Workflow, and Cost data migration hours
 * - Core effort hours (Requirements, Migration Plan, Validation, Final QA, PM Oversight)
 * - Workshop hours
 * - Document migration hours
 * - Travel hours
 * - Complexity factors (BA / PM)
 * - Rate card lookups for final cost
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface MigrationConfig {
  num_projects: number;
  hrs_per_import: number;
  lines_per_import_file: number;
  is_effort_included: boolean;
  is_workshop_included: boolean;
  pm_contingency_pct: number;
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
}

export interface MigrationDetailLine {
  id: string;
  section: "project" | "workflow" | "cost";
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
  row_order: number;
}

// ─── Line-level calculations ─────────────────────────────────────────

export interface LineCalc {
  totalLineItems: number;
  numImports: number;
  hrsPerImport: number;
  totalHours: number;
}

/**
 * For a single detail line, compute # of imports and total hours.
 *
 * Excel formula pattern:
 *   # of Imports = IF(total=0, 0, MAX(2, ROUNDUP(total / linesPerFile, 0)))
 *   Total Hours  = # of Imports × hrsPerImport
 */
export function calculateLineImports(
  totalLineItems: number,
  linesPerImportFile: number,
  hrsPerImport: number
): LineCalc {
  const numImports =
    totalLineItems === 0
      ? 0
      : Math.max(2, Math.ceil(totalLineItems / linesPerImportFile));
  return {
    totalLineItems,
    numImports,
    hrsPerImport,
    totalHours: numImports * hrsPerImport,
  };
}

/**
 * For a cost-section line, total_line_items = quantity × items_per_object.
 * For project/workflow, total_line_items is entered directly.
 */
export function effectiveTotalLineItems(
  line: MigrationDetailLine
): number {
  if (line.section === "cost") {
    return line.quantity * line.items_per_object;
  }
  return line.total_line_items;
}

/**
 * Sum total hours across a set of lines.
 */
export function calculateSectionHours(
  lines: MigrationDetailLine[],
  config: MigrationConfig
): number {
  return lines.reduce((sum, line) => {
    const total = effectiveTotalLineItems(line);
    const calc = calculateLineImports(
      total,
      config.lines_per_import_file,
      config.hrs_per_import
    );
    return sum + calc.totalHours;
  }, 0);
}

// ─── Document migration ──────────────────────────────────────────────

/**
 * Document migration hours = (avg MB per project / MB per hour) × # of projects
 */
export function calculateDocumentHours(config: MigrationConfig): number {
  if (config.doc_mb_per_hour === 0 || config.num_projects === 0) return 0;
  return (config.doc_avg_mb_per_project / config.doc_mb_per_hour) * config.num_projects;
}

// ─── Full migration totals ──────────────────────────────────────────

export interface MigrationTotals {
  // Raw section hours (before complexity factor)
  workshopBaRaw: number;
  workshopPmRaw: number;
  coreBaRaw: number;
  corePmRaw: number;
  projectRaw: number;
  workflowRaw: number;
  costRaw: number;
  documentRaw: number;
  travelBaRaw: number;
  travelPmRaw: number;

  // After complexity factor
  workshopBa: number;
  workshopPm: number;
  coreBa: number;
  corePm: number;
  projectBa: number;
  workflowBa: number;
  costBa: number;
  documentBa: number;
  travelBa: number;
  travelPm: number;

  totalBaHours: number;
  totalPmHours: number;

  // Costs
  baCost: number;
  pmCost: number;
  travelExpense: number; // trips × travel cost/trip (separate from hourly)
  salesPrice: number; // BA cost + PM cost (hourly billing)

  // Summary metrics
  blendedRate: number;
  estimatedMargin: number;
}

/**
 * Calculate the full migration totals, mirroring the Excel left-panel formulas.
 *
 * BA Hours per section (all × ba_complexity_factor):
 *   Workshop:  132 if workshop=Yes, else 0
 *   Core:      Requirements + Migration Plan + Validation + Final QA (if effort=Yes)
 *   Project:   Sum of project detail line hours
 *   Workflow:   Sum of workflow detail line hours
 *   Cost:      Sum of cost detail line hours
 *   Document:  (avg_mb / mb_hr) × num_projects
 *   Travel:    ba_trips × 40
 *
 * PM Hours per section (all × pm_complexity_factor):
 *   Workshop:  8 if workshop=Yes, else 0
 *   Core:      PM Oversight hours (if effort=Yes)
 *   Travel:    pm_trips × 40
 */
export function calculateMigrationTotals(
  config: MigrationConfig,
  projectLines: MigrationDetailLine[],
  workflowLines: MigrationDetailLine[],
  costLines: MigrationDetailLine[],
  baRate: number,
  pmRate: number,
  travelCostPerTrip: number
): MigrationTotals {
  // Raw hours before complexity
  const workshopBaRaw = config.is_workshop_included ? 132 : 0;
  const workshopPmRaw = config.is_workshop_included ? 8 : 0;

  const coreBaRaw = config.is_effort_included
    ? config.core_requirements_hrs +
      config.core_migration_plan_hrs +
      config.core_validation_hrs +
      config.core_final_qa_hrs
    : 0;
  const corePmRaw = config.is_effort_included
    ? config.core_pm_oversight_hrs
    : 0;

  const projectRaw = calculateSectionHours(projectLines, config);
  const workflowRaw = calculateSectionHours(workflowLines, config);
  const costRaw = calculateSectionHours(costLines, config);
  const documentRaw = calculateDocumentHours(config);

  const travelBaRaw = config.ba_trips * 40;
  const travelPmRaw = config.pm_trips * 40;

  // Apply complexity factors
  const baF = config.ba_complexity_factor;
  const pmF = config.pm_complexity_factor;

  const workshopBa = workshopBaRaw * baF;
  const workshopPm = workshopPmRaw * pmF;
  const coreBa = coreBaRaw * baF;
  const corePm = corePmRaw * pmF;
  const projectBa = projectRaw * baF;
  const workflowBa = workflowRaw * baF;
  const costBa = costRaw * baF;
  const documentBa = documentRaw * baF;
  const travelBa = travelBaRaw * baF;
  const travelPm = travelPmRaw * pmF;

  const totalBaHours =
    workshopBa + coreBa + projectBa + workflowBa + costBa + documentBa + travelBa;
  const totalPmHours = workshopPm + corePm + travelPm;

  // Costs
  const baCost = totalBaHours * baRate;
  const pmCost = totalPmHours * pmRate;
  const travelExpense =
    (config.ba_trips + config.pm_trips) * travelCostPerTrip;
  const salesPrice = baCost + pmCost;

  // Summary
  const totalHours = totalBaHours + totalPmHours;
  const blendedRate = totalHours === 0 ? 0 : salesPrice / totalHours;
  const estimatedMargin =
    salesPrice === 0 ? 0 : 1 - 75 / blendedRate;

  return {
    workshopBaRaw,
    workshopPmRaw,
    coreBaRaw,
    corePmRaw,
    projectRaw,
    workflowRaw,
    costRaw,
    documentRaw,
    travelBaRaw,
    travelPmRaw,
    workshopBa,
    workshopPm,
    coreBa,
    corePm,
    projectBa,
    workflowBa,
    costBa,
    documentBa,
    travelBa,
    travelPm,
    totalBaHours,
    totalPmHours,
    baCost,
    pmCost,
    travelExpense,
    salesPrice,
    blendedRate,
    estimatedMargin,
  };
}

// ─── Default line presets ────────────────────────────────────────────

export const DEFAULT_PROJECT_LINES: Omit<MigrationDetailLine, "id">[] = [
  { section: "project", label: "Project Info/Detail", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 0 },
  { section: "project", label: "Schedules",          quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 1 },
];

export const DEFAULT_WORKFLOW_LINES: Omit<MigrationDetailLine, "id">[] = Array.from(
  { length: 11 },
  (_, i) => ({
    section: "workflow" as const,
    label: "WF Object Name",
    quantity: 0,
    items_per_object: 0,
    total_line_items: 0,
    row_order: i,
  })
);

export const DEFAULT_COST_LINES: Omit<MigrationDetailLine, "id">[] = [
  { section: "cost", label: "Budgets",              quantity: 1, items_per_object: 0, total_line_items: 0, row_order: 0 },
  { section: "cost", label: "Commitments",          quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 1 },
  { section: "cost", label: "Commitment Changes",   quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 2 },
  { section: "cost", label: "Commitment Invoices",  quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 3 },
  { section: "cost", label: "General Invoices",     quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 4 },
  { section: "cost", label: "TBD",                  quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 5 },
  { section: "cost", label: "TBD",                  quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 6 },
  { section: "cost", label: "TBD",                  quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 7 },
  { section: "cost", label: "TBD",                  quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 8 },
];
