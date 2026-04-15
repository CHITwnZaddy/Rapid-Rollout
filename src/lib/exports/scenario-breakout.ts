import * as XLSX from "xlsx";

/**
 * Pure XLSX builder for the Scenario Breakout report. Lifted out of
 * the page component so it can be unit-tested and reused from other
 * call sites (e.g. a future batch export or an API route).
 */

export interface ScenarioBreakoutLine {
  module: string;
  scope_selection: string | null;
  total_cost: number;
}

export interface ScenarioBreakoutGroup {
  scenarioType: string;
  lines: ScenarioBreakoutLine[];
  totalCost: number;
}

export interface ScopedServiceExportLine {
  service_type: string;
  description: string | null;
  cost: number;
}

/**
 * The migration grand total used to be read from `migrationConfig.computed_total_cost`,
 * which is the migration page's last-saved snapshot and could drift from the
 * live section breakdowns shown in the report. Callers now compute it live
 * (via `calculateMigrationTotals`) and pass it in here.
 */
export interface MigrationExportSummary {
  total: number;
}

export interface ScenarioBreakoutExportInput {
  proposalName: string;
  scenarioGroups: ScenarioBreakoutGroup[];
  scopedLines: ScopedServiceExportLine[];
  migrationSummary: MigrationExportSummary | null;
}

type Row = Record<string, string | number>;

export function buildScenarioBreakoutRows(
  input: ScenarioBreakoutExportInput
): Row[] {
  const { scenarioGroups, scopedLines, migrationSummary } = input;
  const rows: Row[] = [];

  for (const g of scenarioGroups) {
    for (const l of g.lines) {
      rows.push({
        Section: g.scenarioType,
        Item: l.module,
        Detail: l.scope_selection ?? "",
        Subtotal: l.total_cost,
      });
    }
    rows.push({
      Section: `${g.scenarioType} Total`,
      Item: "",
      Detail: "",
      Subtotal: g.totalCost,
    });
  }

  if (scopedLines.length > 0) {
    for (const s of scopedLines) {
      rows.push({
        Section: "Scoped Services",
        Item: s.service_type,
        Detail: s.description ?? "",
        Subtotal: s.cost,
      });
    }
    rows.push({
      Section: "Scoped Services Total",
      Item: "",
      Detail: "",
      Subtotal: scopedLines.reduce((sum, l) => sum + l.cost, 0),
    });
  }

  if (migrationSummary) {
    rows.push({
      Section: "Migration Services",
      Item: "Total",
      Detail: "",
      Subtotal: Number(migrationSummary.total) || 0,
    });
  }

  return rows;
}

export function scenarioBreakoutFileName(proposalName: string): string {
  const datePart = new Date().toISOString().slice(0, 10);
  return `scenario-breakout-${proposalName}-${datePart}.xlsx`;
}

export function exportScenarioBreakoutXLSX(
  input: ScenarioBreakoutExportInput
): void {
  const rows = buildScenarioBreakoutRows(input);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Scenario Breakout");
  XLSX.writeFile(wb, scenarioBreakoutFileName(input.proposalName));
}
