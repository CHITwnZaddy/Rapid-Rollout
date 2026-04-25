/**
 * Migration Services Calculation Engine
 *
 * Replicates the Excel "Migration Services" sheet logic:
 * - Project, Workflow, and Cost data migration hours
 * - Core effort hours (Requirements, Migration Plan, Validation, Final QA, PM Oversight)
 * - Workshop hours
 * - Document migration hours
 * - Travel hours
 * - Complexity factor and contingency breakout
 * - Rate card lookups for final cost
 */

import {
  calculateRolePricingBreakouts,
  sumContingencyBreakouts,
  type ContingencyPricingBreakout,
  type RolePricingBreakout,
} from "@/lib/calculations/contingency-pricing";

// ─── Types ───────────────────────────────────────────────────────────

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
};

export type MigrationDetailLine = {
  id: string;
  section: "project" | "workflow" | "cost";
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
  row_order: number;
};

// ─── Line-level calculations ─────────────────────────────────────────

export type LineCalc = {
  totalLineItems: number;
  numImports: number;
  hrsPerImport: number;
  totalHours: number;
};

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
 * Total line items = quantity × items_per_object for every section.
 * Originally workflow rows let the user type the total directly, but
 * the SE workflow on the floor matches the project/cost rule, so all
 * three sections now compute it from the two inputs.
 */
export function effectiveTotalLineItems(
  line: MigrationDetailLine
): number {
  return line.quantity * line.items_per_object;
}

/**
 * For a single detail line, return the full LineCalc (effective total,
 * # of imports, hrs/import, total hours). This is the canonical way to
 * compute per-row hours: both the UI row renderer and the section-total
 * sum go through it, so the two cannot drift.
 */
export function computeLineHours(
  line: MigrationDetailLine,
  config: Pick<MigrationConfig, "lines_per_import_file" | "hrs_per_import">
): LineCalc {
  return calculateLineImports(
    effectiveTotalLineItems(line),
    config.lines_per_import_file,
    config.hrs_per_import
  );
}

/**
 * Sum total hours across a set of lines — identical to summing
 * computeLineHours(l, cfg).totalHours for every line.
 */
export function calculateSectionHours(
  lines: MigrationDetailLine[],
  config: MigrationConfig
): number {
  return lines.reduce((sum, line) => sum + computeLineHours(line, config).totalHours, 0);
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

export type MigrationTotals = {
  // Raw section hours (before complexity factor).
  workshopSrImRaw: number;
  workshopPmRaw: number;
  coreSrImRaw: number;
  corePmRaw: number;
  projectRaw: number;
  workflowRaw: number;
  costRaw: number;
  documentRaw: number;
  travelSrImRaw: number;
  travelPmRaw: number;

  // After complexity factor (base + contingency billable hours).
  workshopSrIm: number;
  workshopPm: number;
  coreSrIm: number;
  corePm: number;
  projectSrIm: number;
  workflowSrIm: number;
  costSrIm: number;
  documentSrIm: number;
  travelSrIm: number;
  travelPm: number;

  totalSrImHours: number;
  totalPmHours: number;

  // Base hours before complexity factor.
  baseSrImHours: number;
  basePmHours: number;
  baseHours: number;
  srImContingencyHours: number;
  pmContingencyHours: number;
  contingencyHours: number;

  // Costs
  baseSrImCost: number;
  basePmCost: number;
  baseCost: number;
  srImContingencyCost: number;
  pmContingencyCost: number;
  contingencyCost: number;
  srImCost: number;
  pmCost: number;
  travelExpense: number; // trips × travel cost/trip (separate from hourly)
  clientPrice: number; // base cost + contingency cost (hourly billing)
  salesPrice: number; // Deprecated alias for clientPrice during cutover.
  internalCost: number;

  // Summary metrics
  blendedRate: number;
  estimatedMargin: number;
  marginPercent: number | null;
  roleBreakouts: RolePricingBreakout[];
  pricingBreakout: ContingencyPricingBreakout;
};

/**
 * Calculate the full migration totals, mirroring the Excel left-panel formulas.
 *
 * Sr. IM hours per section (all × complexity_factor):
 *   Workshop:  132 if workshop=Yes, else 0
 *   Core:      Requirements + Migration Plan + Validation + Final QA (if effort=Yes)
 *   Project:   Sum of project detail line hours
 *   Workflow:   Sum of workflow detail line hours
 *   Cost:      Sum of cost detail line hours
 *   Document:  (avg_mb / mb_hr) × num_projects
 *   Travel:    sr_im_trips × 40
 *
 * PM II Hours per section (all × complexity_factor):
 *   Workshop:  8 if workshop=Yes, else 0
 *   Core:      PM Oversight hours (if effort=Yes)
 *   Travel:    pm_trips × 40
 */
export function calculateMigrationTotals(
  config: MigrationConfig,
  projectLines: MigrationDetailLine[],
  workflowLines: MigrationDetailLine[],
  costLines: MigrationDetailLine[],
  srImRate: number,
  pmRate: number,
  travelCostPerTrip: number,
  internalCostRate: number
): MigrationTotals {
  // Raw hours before complexity
  const workshopSrImRaw = config.is_workshop_included ? 132 : 0;
  const workshopPmRaw = config.is_workshop_included ? 8 : 0;

  const coreSrImRaw = config.is_effort_included
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

  const travelSrImRaw = config.sr_im_trips * 40;
  const travelPmRaw = config.pm_trips * 40;

  // Apply one shared complexity factor. The base hours remain the internal
  // cost basis; the factor delta is the client-facing contingency.
  const complexityFactor = config.complexity_factor;

  const workshopSrIm = workshopSrImRaw * complexityFactor;
  const workshopPm = workshopPmRaw * complexityFactor;
  const coreSrIm = coreSrImRaw * complexityFactor;
  const corePm = corePmRaw * complexityFactor;
  const projectSrIm = projectRaw * complexityFactor;
  const workflowSrIm = workflowRaw * complexityFactor;
  const costSrIm = costRaw * complexityFactor;
  const documentSrIm = documentRaw * complexityFactor;
  const travelSrIm = travelSrImRaw * complexityFactor;
  const travelPm = travelPmRaw * complexityFactor;

  const totalSrImHours =
    workshopSrIm + coreSrIm + projectSrIm + workflowSrIm + costSrIm + documentSrIm + travelSrIm;
  const totalPmHours = workshopPm + corePm + travelPm;
  const baseSrImHours =
    workshopSrImRaw +
    coreSrImRaw +
    projectRaw +
    workflowRaw +
    costRaw +
    documentRaw +
    travelSrImRaw;
  const basePmHours = workshopPmRaw + corePmRaw + travelPmRaw;
  const baseHours = baseSrImHours + basePmHours;
  const srImContingencyHours = totalSrImHours - baseSrImHours;
  const pmContingencyHours = totalPmHours - basePmHours;
  const contingencyHours = srImContingencyHours + pmContingencyHours;

  const roleBreakouts = calculateRolePricingBreakouts(
    [
      {
        role: "srIm",
        label: "Sr. IM",
        baseHours: baseSrImHours,
        rate: srImRate,
      },
      {
        role: "pm",
        label: "PM",
        baseHours: basePmHours,
        rate: pmRate,
      },
    ],
    complexityFactor,
    internalCostRate
  );
  const pricingBreakout = sumContingencyBreakouts(roleBreakouts);

  // Costs
  const baseSrImCost = baseSrImHours * srImRate;
  const basePmCost = basePmHours * pmRate;
  const baseCost = baseSrImCost + basePmCost;
  const srImContingencyCost = srImContingencyHours * srImRate;
  const pmContingencyCost = pmContingencyHours * pmRate;
  const contingencyCost = srImContingencyCost + pmContingencyCost;
  const srImCost = totalSrImHours * srImRate;
  const pmCost = totalPmHours * pmRate;
  const travelExpense =
    (config.sr_im_trips + config.pm_trips) * travelCostPerTrip;
  const clientPrice = pricingBreakout.clientPrice;
  const salesPrice = clientPrice;
  const internalCost = pricingBreakout.internalCost;

  // Summary
  const totalHours = totalSrImHours + totalPmHours;
  const blendedRate = totalHours === 0 ? 0 : clientPrice / totalHours;
  const marginPercent = pricingBreakout.marginPercent;
  const estimatedMargin = marginPercent === null ? 0 : marginPercent / 100;

  return {
    workshopSrImRaw,
    workshopPmRaw,
    coreSrImRaw,
    corePmRaw,
    projectRaw,
    workflowRaw,
    costRaw,
    documentRaw,
    travelSrImRaw,
    travelPmRaw,
    workshopSrIm,
    workshopPm,
    coreSrIm,
    corePm,
    projectSrIm,
    workflowSrIm,
    costSrIm,
    documentSrIm,
    travelSrIm,
    travelPm,
    totalSrImHours,
    totalPmHours,
    baseSrImHours,
    basePmHours,
    baseHours,
    srImContingencyHours,
    pmContingencyHours,
    contingencyHours,
    baseSrImCost,
    basePmCost,
    baseCost,
    srImContingencyCost,
    pmContingencyCost,
    contingencyCost,
    srImCost,
    pmCost,
    travelExpense,
    clientPrice,
    salesPrice,
    internalCost,
    blendedRate,
    estimatedMargin,
    marginPercent,
    roleBreakouts,
    pricingBreakout,
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
