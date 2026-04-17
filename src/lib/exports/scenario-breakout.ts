import type ExcelJS from "exceljs";

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
 * The migration grand total is computed live (via `calculateMigrationTotals`)
 * and passed in here — never read from the stored `computed_total_cost` snapshot.
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

// ─────────────────────────────────────────────────────────────────────────────
// buildScenarioBreakoutRows — kept for unit tests and any non-styled consumers
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// exportScenarioBreakoutXLSX — fully styled exceljs workbook
// ─────────────────────────────────────────────────────────────────────────────

export async function exportScenarioBreakoutXLSX(
  input: ScenarioBreakoutExportInput
): Promise<void> {
  const { proposalName, scenarioGroups, scopedLines, migrationSummary } = input;

  // Dynamic import — keeps exceljs out of the initial JS bundle.
  const ExcelJS = (await import("exceljs")).default;

  // ── Colour / style constants ────────────────────────────────────────────────
  const TITLE_BG      = "FFD6E4F7"; // light blue  — title row
  const HEADER_BG     = "FFE2E8F0"; // light gray  — column headers + section totals
  const ALT_ROW_BG    = "FFF0F4FA"; // pale blue-gray — alternating data rows
  const WHITE         = "FFFFFFFF";
  const CURRENCY_FMT  = "$#,##0.00";

  // ── Workbook / sheet ────────────────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Scenario Breakout");

  // 4 columns: Scenario/Section · Module · Detail · Subtotal
  sheet.columns = [
    { width: 26 }, // A Scenario / Section
    { width: 34 }, // B Module
    { width: 28 }, // C Detail
    { width: 18 }, // D Subtotal
  ];

  // ── Row 1: Title ─────────────────────────────────────────────────────────────
  sheet.mergeCells("A1:D1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "Rapid Rollout – Scenario Breakout";
  titleCell.font = { bold: true, size: 24 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: TITLE_BG },
  };
  sheet.getRow(1).height = 44;

  // ── Row 2: Proposal name ──────────────────────────────────────────────────────
  sheet.mergeCells("A2:D2");
  const proposalCell = sheet.getCell("A2");
  proposalCell.value = `Proposal: ${proposalName}`;
  proposalCell.font = { size: 11, italic: true };
  proposalCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  sheet.getRow(2).height = 20;

  // ── Row 3: Spacer ─────────────────────────────────────────────────────────────
  sheet.getRow(3).height = 8;

  // ── Row 4: Column headers ─────────────────────────────────────────────────────
  const HEADER_NAMES = ["Scenario / Section", "Module", "Detail", "Subtotal"];
  const headerRow = sheet.getRow(4);
  HEADER_NAMES.forEach((name, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = name;
    cell.font = { bold: true, size: 12 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_BG },
    };
  });
  headerRow.height = 22;

  // ── Data rows (starting at row 5) ─────────────────────────────────────────────
  //
  // Each "section" (scenario group, scoped services, migration) is emitted as:
  //   - N line-item rows  (alternating ALT_ROW_BG / WHITE)
  //   - 1 section-total row  (bold, HEADER_BG)
  //
  // A global data-row counter drives the alternating colour so the
  // alternation continues visually across section boundaries.

  let rowNum = 5;
  let dataRowIdx = 0; // alternating counter — increments only on non-total rows

  const solidFill = (argb: string): ExcelJS.Fill => ({
    type: "pattern",
    pattern: "solid",
    fgColor: { argb },
  });

  function writeDataRow(
    values: [string, string, string, number | string],
    opts: { bold?: boolean; bg?: string } = {}
  ) {
    const row = sheet.getRow(rowNum++);
    const bg = opts.bg ?? (dataRowIdx % 2 === 0 ? ALT_ROW_BG : WHITE);
    const fill = solidFill(bg);

    // Columns A–C: text, left-aligned, indent 1
    const [col1, col2, col3, col4] = values;
    [col1, col2, col3].forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { size: 12, bold: opts.bold ?? false };
      cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      cell.fill = fill;
    });

    // Column D: numeric, currency format, right-aligned
    const numCell = row.getCell(4);
    numCell.value = typeof col4 === "number" ? col4 : 0;
    numCell.numFmt = CURRENCY_FMT;
    numCell.font = { size: 12, bold: opts.bold ?? false };
    numCell.alignment = { horizontal: "right", vertical: "middle" };
    numCell.fill = fill;

    row.height = 18;
  }

  // Scenario groups
  for (const g of scenarioGroups) {
    for (const l of g.lines) {
      writeDataRow([g.scenarioType, l.module, l.scope_selection ?? "", l.total_cost]);
      dataRowIdx++;
    }
    // Section total row — always bold + gray, not part of alternation
    writeDataRow(
      [`${g.scenarioType} Total`, "", "", g.totalCost],
      { bold: true, bg: HEADER_BG }
    );
  }

  // Scoped services
  if (scopedLines.length > 0) {
    for (const s of scopedLines) {
      writeDataRow(["Scoped Services", s.service_type, s.description ?? "", s.cost]);
      dataRowIdx++;
    }
    writeDataRow(
      ["Scoped Services Total", "", "", scopedLines.reduce((sum, l) => sum + l.cost, 0)],
      { bold: true, bg: HEADER_BG }
    );
  }

  // Migration services
  if (migrationSummary) {
    const migTotal = Number(migrationSummary.total) || 0;
    writeDataRow(["Migration Services", "Total", "", migTotal]);
    dataRowIdx++;
  }

  // ── Grand Total row ───────────────────────────────────────────────────────────
  const grandTotal =
    scenarioGroups.reduce((sum, g) => sum + g.totalCost, 0) +
    scopedLines.reduce((sum, l) => sum + l.cost, 0) +
    (migrationSummary ? Number(migrationSummary.total) || 0 : 0);

  // Merge A–C for the label
  sheet.mergeCells(`A${rowNum}:C${rowNum}`);
  const gtRow = sheet.getRow(rowNum);

  const gtLabelCell = gtRow.getCell(1);
  gtLabelCell.value = "Grand Total";
  gtLabelCell.font = { bold: true, size: 12 };
  gtLabelCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  gtLabelCell.fill = solidFill(HEADER_BG);

  const gtValueCell = gtRow.getCell(4);
  gtValueCell.value = grandTotal;
  gtValueCell.numFmt = CURRENCY_FMT;
  gtValueCell.font = { bold: true, size: 12 };
  gtValueCell.alignment = { horizontal: "right", vertical: "middle" };
  gtValueCell.fill = solidFill(HEADER_BG);
  gtRow.height = 22;

  // ── Write buffer → browser download ──────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = scenarioBreakoutFileName(proposalName);
  anchor.click();
  URL.revokeObjectURL(url);
}
