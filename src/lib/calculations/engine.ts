export interface ServiceHoursRow {
  service_name: string;
  scope_value: string;
  sr_im_hours: number;
  pm_hours: number;
  ba_hours: number;
  scope_label: string;
  service_group: string;
  lookup_key: string;
}

export interface RateCardRow {
  activity: string;
  rate: number;
  role_category: string;
  lookup_key: string;
}

export interface ScenarioLineInput {
  module: string;
  scopeSelection: string | null;
}

export interface ScenarioLineOutput {
  module: string;
  scopeSelection: string | null;
  scopeLabel: string;
  srImHours: number;
  srImCost: number;
  pmHours: number;
  pmCost: number;
  baHours: number;
  baCost: number;
  totalHours: number;
  totalCost: number;
}

export interface ScenarioTotals {
  totalSrImHours: number;
  totalSrImCost: number;
  totalPmHours: number;
  totalPmCost: number;
  totalBaHours: number;
  totalBaCost: number;
  totalHours: number;
  totalCost: number;
}

export interface ScenarioSummary {
  scenarioType: string;
  totalHours: number;
  totalCost: number;
}

export interface DashboardComparison {
  scenarios: ScenarioSummary[];
  lowestCost: ScenarioSummary | null;
  lowestHours: ScenarioSummary | null;
}

/**
 * Build a lookup map from service_hours rows keyed by lookup_key
 */
export function buildServiceHoursMap(
  rows: ServiceHoursRow[]
): Map<string, ServiceHoursRow> {
  const map = new Map<string, ServiceHoursRow>();
  for (const row of rows) {
    if (row.lookup_key) {
      map.set(row.lookup_key, row);
    }
  }
  return map;
}

/**
 * Build a lookup map from rate_cards rows keyed by lookup_key
 */
export function buildRateCardMap(
  rows: RateCardRow[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.lookup_key) {
      map.set(row.lookup_key, row.rate);
    }
  }
  return map;
}

/**
 * Calculate a single scenario line (replaces Excel XLOOKUP chain).
 *
 * lookup_key format: "ServiceName|ScopeValue"
 * Rate card lookup_key format: "RateCardName|Activity"
 */
export function calculateScenarioLine(
  line: ScenarioLineInput,
  serviceHoursMap: Map<string, ServiceHoursRow>,
  rateCardMap: Map<string, number>,
  rateCardName: string = "Master"
): ScenarioLineOutput {
  const result: ScenarioLineOutput = {
    module: line.module,
    scopeSelection: line.scopeSelection,
    scopeLabel: "",
    srImHours: 0,
    srImCost: 0,
    pmHours: 0,
    pmCost: 0,
    baHours: 0,
    baCost: 0,
    totalHours: 0,
    totalCost: 0,
  };

  if (!line.scopeSelection) return result;

  const lookupKey = `${line.module}|${line.scopeSelection}`;
  const serviceData = serviceHoursMap.get(lookupKey);

  if (!serviceData) return result;

  result.scopeLabel = serviceData.scope_label;
  result.srImHours = serviceData.sr_im_hours;
  result.pmHours = serviceData.pm_hours;
  result.baHours = serviceData.ba_hours;

  // Look up rates for each role
  const srImRate = rateCardMap.get(`${rateCardName}|Sr. Implementation Manager`) ?? 0;
  const pmRate = rateCardMap.get(`${rateCardName}|Program Manager`) ?? 0;
  const baRate = rateCardMap.get(`${rateCardName}|Business Analyst`) ?? 0;

  result.srImCost = result.srImHours * srImRate;
  result.pmCost = result.pmHours * pmRate;
  result.baCost = result.baHours * baRate;
  result.totalHours = result.srImHours + result.pmHours + result.baHours;
  result.totalCost = result.srImCost + result.pmCost + result.baCost;

  return result;
}

/**
 * Calculate totals for all lines in a scenario
 */
export function calculateScenarioTotals(
  lines: ScenarioLineOutput[]
): ScenarioTotals {
  return lines.reduce(
    (totals, line) => ({
      totalSrImHours: totals.totalSrImHours + line.srImHours,
      totalSrImCost: totals.totalSrImCost + line.srImCost,
      totalPmHours: totals.totalPmHours + line.pmHours,
      totalPmCost: totals.totalPmCost + line.pmCost,
      totalBaHours: totals.totalBaHours + line.baHours,
      totalBaCost: totals.totalBaCost + line.baCost,
      totalHours: totals.totalHours + line.totalHours,
      totalCost: totals.totalCost + line.totalCost,
    }),
    {
      totalSrImHours: 0,
      totalSrImCost: 0,
      totalPmHours: 0,
      totalPmCost: 0,
      totalBaHours: 0,
      totalBaCost: 0,
      totalHours: 0,
      totalCost: 0,
    }
  );
}

/**
 * Compare scenarios and find the lowest cost and lowest hours (replaces Dashboard MIN/INDEX/MATCH)
 */
export function compareScenarios(
  scenarios: ScenarioSummary[]
): DashboardComparison {
  const active = scenarios.filter((s) => s.totalCost > 0 || s.totalHours > 0);

  let lowestCost: ScenarioSummary | null = null;
  let lowestHours: ScenarioSummary | null = null;

  for (const s of active) {
    if (!lowestCost || s.totalCost < lowestCost.totalCost) {
      lowestCost = s;
    }
    if (!lowestHours || s.totalHours < lowestHours.totalHours) {
      lowestHours = s;
    }
  }

  return { scenarios, lowestCost, lowestHours };
}

/**
 * Calculate scoped service line cost
 */
export function calculateScopedServiceCost(
  hours: number,
  rateCardMap: Map<string, number>,
  rateCardLookupKey: string
): number {
  const rate = rateCardMap.get(rateCardLookupKey) ?? 0;
  return hours * rate;
}

/**
 * Format a number as USD currency
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a number with one decimal place for hours
 */
export function formatHours(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}
