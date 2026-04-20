import { describe, it, expect } from "vitest";
import {
  buildServiceHoursMap,
  buildRateCardMap,
  calculateScenarioLine,
  calculateScenarioTotals,
  compareScenarios,
  calculateScopedServiceCost,
  formatCurrency,
  formatHours,
  type ServiceHoursRow,
  type RateCardRow,
  type ScenarioLineOutput,
} from "../engine";

const sh = (over: Partial<ServiceHoursRow>): ServiceHoursRow => ({
  service_name: "Financials",
  scope_value: "Small",
  sr_im_hours: 10,
  pm_hours: 4,
  ba_hours: 6,
  scope_label: "Small (1 entity)",
  service_group: "Core",
  lookup_key: "Financials|Small",
  ...over,
});

const rc = (over: Partial<RateCardRow>): RateCardRow => ({
  activity: "Sr. Implementation Manager",
  rate: 275,
  role_category: "Sr IM",
  lookup_key: "Master|Sr. Implementation Manager",
  ...over,
});

const defaultRates: RateCardRow[] = [
  rc({}),
  rc({ activity: "Program Manager", rate: 225, role_category: "PM", lookup_key: "Master|Program Manager" }),
  rc({ activity: "Business Analyst", rate: 200, role_category: "BA", lookup_key: "Master|Business Analyst" }),
];

describe("buildServiceHoursMap", () => {
  it("keys rows by lookup_key", () => {
    const rows = [sh({}), sh({ lookup_key: "Financials|Large", scope_value: "Large" })];
    const map = buildServiceHoursMap(rows);
    expect(map.size).toBe(2);
    expect(map.get("Financials|Small")?.sr_im_hours).toBe(10);
    expect(map.get("Financials|Large")?.scope_value).toBe("Large");
  });

  it("skips rows with empty lookup_key", () => {
    const rows = [sh({ lookup_key: "" }), sh({})];
    const map = buildServiceHoursMap(rows);
    expect(map.size).toBe(1);
  });

  it("handles empty input", () => {
    expect(buildServiceHoursMap([]).size).toBe(0);
  });
});

describe("buildRateCardMap", () => {
  it("keys rates by lookup_key", () => {
    const map = buildRateCardMap(defaultRates);
    expect(map.get("Master|Sr. Implementation Manager")).toBe(275);
    expect(map.get("Master|Program Manager")).toBe(225);
    expect(map.get("Master|Business Analyst")).toBe(200);
  });

  it("returns empty map for empty input", () => {
    expect(buildRateCardMap([]).size).toBe(0);
  });
});

describe("calculateScenarioLine", () => {
  const shMap = buildServiceHoursMap([sh({})]);
  const rcMap = buildRateCardMap(defaultRates);

  it("returns zero output when scopeSelection is null", () => {
    const result = calculateScenarioLine(
      { module: "Financials", scopeSelection: null },
      shMap,
      rcMap
    );
    expect(result.totalHours).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.scopeLabel).toBe("");
  });

  it("returns zero output when lookup key is missing", () => {
    const result = calculateScenarioLine(
      { module: "Financials", scopeSelection: "Mega" },
      shMap,
      rcMap
    );
    expect(result.totalHours).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it("computes per-role costs and totals from hours × rates", () => {
    const result = calculateScenarioLine(
      { module: "Financials", scopeSelection: "Small" },
      shMap,
      rcMap
    );
    // 10 hrs Sr IM @ 275 = 2750
    // 4 hrs PM @ 225 = 900
    // 6 hrs BA @ 200 = 1200
    expect(result.srImCost).toBe(2750);
    expect(result.pmCost).toBe(900);
    expect(result.baCost).toBe(1200);
    expect(result.totalHours).toBe(20);
    expect(result.totalCost).toBe(4850);
    expect(result.scopeLabel).toBe("Small (1 entity)");
  });

  it("treats a missing rate as zero (not NaN)", () => {
    const partial = buildRateCardMap([rc({})]); // only Sr IM rate
    const result = calculateScenarioLine(
      { module: "Financials", scopeSelection: "Small" },
      shMap,
      partial
    );
    expect(result.srImCost).toBe(2750);
    expect(result.pmCost).toBe(0);
    expect(result.baCost).toBe(0);
    expect(result.totalCost).toBe(2750);
  });

  it("supports non-Master rate card name", () => {
    const rows = [
      rc({ lookup_key: "Reseller|Sr. Implementation Manager", rate: 300 }),
      rc({ lookup_key: "Reseller|Program Manager", rate: 250 }),
      rc({ lookup_key: "Reseller|Business Analyst", rate: 220 }),
    ];
    const result = calculateScenarioLine(
      { module: "Financials", scopeSelection: "Small" },
      shMap,
      buildRateCardMap(rows),
      "Reseller"
    );
    expect(result.srImCost).toBe(3000);
    expect(result.pmCost).toBe(1000);
    expect(result.baCost).toBe(1320);
  });
});

describe("calculateScenarioTotals", () => {
  const mkLine = (over: Partial<ScenarioLineOutput>): ScenarioLineOutput => ({
    module: "X",
    scopeSelection: "S",
    scopeLabel: "",
    srImHours: 0,
    srImCost: 0,
    pmHours: 0,
    pmCost: 0,
    baHours: 0,
    baCost: 0,
    totalHours: 0,
    totalCost: 0,
    ...over,
  });

  it("returns all zeros for empty list", () => {
    const totals = calculateScenarioTotals([]);
    expect(totals.totalCost).toBe(0);
    expect(totals.totalHours).toBe(0);
  });

  it("sums per-role hours and costs across lines", () => {
    const totals = calculateScenarioTotals([
      mkLine({ srImHours: 10, srImCost: 2750, totalHours: 10, totalCost: 2750 }),
      mkLine({ pmHours: 4, pmCost: 900, totalHours: 4, totalCost: 900 }),
      mkLine({ baHours: 6, baCost: 1200, totalHours: 6, totalCost: 1200 }),
    ]);
    expect(totals.totalSrImHours).toBe(10);
    expect(totals.totalSrImCost).toBe(2750);
    expect(totals.totalPmHours).toBe(4);
    expect(totals.totalBaHours).toBe(6);
    expect(totals.totalHours).toBe(20);
    expect(totals.totalCost).toBe(4850);
  });
});

describe("compareScenarios", () => {
  it("returns nulls for empty list", () => {
    const result = compareScenarios([]);
    expect(result.lowestCost).toBeNull();
    expect(result.lowestHours).toBeNull();
  });

  it("ignores scenarios with zero cost and zero hours", () => {
    const result = compareScenarios([
      { scenarioType: "P1", totalHours: 0, totalCost: 0 },
      { scenarioType: "P2", totalHours: 10, totalCost: 1000 },
    ]);
    expect(result.lowestCost?.scenarioType).toBe("P2");
    expect(result.lowestHours?.scenarioType).toBe("P2");
  });

  it("picks lowest cost and lowest hours independently", () => {
    const result = compareScenarios([
      { scenarioType: "P1", totalHours: 100, totalCost: 1000 },
      { scenarioType: "P2", totalHours: 50, totalCost: 2000 },
      { scenarioType: "P3", totalHours: 80, totalCost: 800 },
    ]);
    expect(result.lowestCost?.scenarioType).toBe("P3");
    expect(result.lowestHours?.scenarioType).toBe("P2");
  });
});

describe("calculateScopedServiceCost", () => {
  const rcMap = buildRateCardMap(defaultRates);

  it("multiplies hours by the looked-up rate", () => {
    expect(
      calculateScopedServiceCost(8, rcMap, "Master|Program Manager")
    ).toBe(1800);
  });

  it("returns zero when the rate key is missing", () => {
    expect(calculateScopedServiceCost(8, rcMap, "Master|Unknown")).toBe(0);
  });

  it("returns zero for zero hours", () => {
    expect(
      calculateScopedServiceCost(0, rcMap, "Master|Business Analyst")
    ).toBe(0);
  });
});

describe("formatCurrency", () => {
  it("formats as USD with no decimals", () => {
    expect(formatCurrency(1234)).toBe("$1,234");
    expect(formatCurrency(0)).toBe("$0");
  });

  it("rounds at display time", () => {
    expect(formatCurrency(1234.56)).toBe("$1,235");
  });

  it("formats negative amounts with a minus sign", () => {
    expect(formatCurrency(-1000)).toBe("-$1,000");
  });

  it("formats very large amounts without overflow", () => {
    expect(formatCurrency(1_000_000_000)).toBe("$1,000,000,000");
  });
});

describe("formatHours", () => {
  it("shows one decimal", () => {
    expect(formatHours(10)).toBe("10.0");
    expect(formatHours(10.25)).toBe("10.3");
  });
});
