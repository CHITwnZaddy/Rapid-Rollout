import type ExcelJS from "exceljs";
import { toDateOrNull } from "@/lib/reports/format";
import type {
  ReportColumn,
  ReportConfig,
  ReportRowData,
} from "@/lib/reports/report-config";

// ─────────────────────────────────────────────────────────────
// Shared XLSX export for all reports. Centralizes the Rapid Rollout
// workbook theme (title block, header styling, alternating rows,
// totals) that was previously copy-pasted into every report page.
// Change a color here and every export picks it up.
// ─────────────────────────────────────────────────────────────

const CURRENCY_FMT = "$#,##0.00";
const TITLE_BG = "FFC1C1DE"; // #313392 tint — title row
const HEADER_BG = "FFD5D6E9"; // #313392 tint — column headers + totals
const ALT_ROW_BG = "FFEAEAF4"; // #313392 tint — alternating data rows
const WHITE = "FFFFFFFF";
const TINT_ARGB: Record<"red" | "green", string> = {
  red: "FFFBD5D5",
  green: "FFD5F5E3",
};

function colLetter(n: number): string {
  // 1 → A, 26 → Z, 27 → AA …
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function fillOf(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function writeDataCell(
  cell: ExcelJS.Cell,
  column: ReportColumn,
  value: string | number | null,
  fill: ExcelJS.Fill
) {
  cell.font = { size: 12, bold: column.bold ?? false };
  cell.fill = fill;

  switch (column.format) {
    case "date": {
      const d = toDateOrNull(typeof value === "string" ? value : null);
      if (d) {
        cell.value = d;
        cell.numFmt = "dd mmm yy";
      } else {
        cell.value = "—";
      }
      cell.alignment = { horizontal: "center", vertical: "middle" };
      break;
    }
    case "currency": {
      const n = Number(value) || 0;
      if (column.dashWhenZero && n === 0) {
        cell.value = "—";
      } else {
        cell.value = n;
        cell.numFmt = CURRENCY_FMT;
      }
      cell.alignment = { horizontal: "right", vertical: "middle" };
      break;
    }
    case "factor": {
      cell.value = Number(value) || 0;
      cell.numFmt = "0.00";
      cell.alignment = { horizontal: "right", vertical: "middle" };
      break;
    }
    case "hours": {
      cell.value = Number(value) || 0;
      cell.numFmt = "#,##0.00";
      cell.alignment = { horizontal: "right", vertical: "middle" };
      break;
    }
    case "integer":
    case "number": {
      cell.value = value === null || value === "" ? "" : Number(value);
      cell.alignment = { horizontal: "right", vertical: "middle" };
      break;
    }
    // link/badge render as plain text in the workbook
    default: {
      cell.value = value ?? "—";
      cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    }
  }
}

function writeTotalsRow(
  sheet: ExcelJS.Worksheet,
  rowNum: number,
  label: string,
  columns: ReportColumn[],
  rows: ReportRowData[]
) {
  const row = sheet.getRow(rowNum);
  const fill = fillOf(HEADER_BG);

  const firstSumIdx = columns.findIndex((c) => c.sum);
  const labelSpan = firstSumIdx === -1 ? columns.length : firstSumIdx;
  if (labelSpan > 1) {
    sheet.mergeCells(`A${rowNum}:${colLetter(labelSpan)}${rowNum}`);
  }
  const labelCell = row.getCell(1);
  labelCell.value = label;
  labelCell.font = { bold: true, size: 12 };
  labelCell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
  labelCell.fill = fill;

  columns.forEach((column, i) => {
    if (!column.sum) return;
    const cell = row.getCell(i + 1);
    cell.value = rows.reduce((sum, r) => sum + (Number(r[column.key]) || 0), 0);
    cell.numFmt = column.format === "currency" ? CURRENCY_FMT : column.format === "hours" ? "#,##0.00" : "0";
    cell.font = { bold: true, size: 12 };
    cell.alignment = { horizontal: "right", vertical: "middle" };
    cell.fill = fill;
  });
  row.height = 22;
}

/**
 * Build and download the styled workbook for a report. Call from the
 * browser only (triggers an anchor download). exceljs is imported
 * dynamically so it stays out of the initial bundle.
 */
export async function exportReportXLSX(
  config: ReportConfig,
  rows: ReportRowData[],
  filterLabel: string
): Promise<void> {
  if (rows.length === 0) return;

  const ExcelJSModule = (await import("exceljs")).default;
  const workbook = new ExcelJSModule.Workbook();
  const sheet = workbook.addWorksheet(config.sheetName);

  const columns = config.columns;
  const lastCol = colLetter(columns.length);

  sheet.columns = columns.map((c) => ({ width: c.width }));

  // Row 1: title
  sheet.mergeCells(`A1:${lastCol}1`);
  const titleCell = sheet.getCell("A1");
  titleCell.value = config.xlsxTitle;
  titleCell.font = { bold: true, size: 24 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = fillOf(TITLE_BG);
  sheet.getRow(1).height = 44;

  // Row 2: filter label
  sheet.mergeCells(`A2:${lastCol}2`);
  const filterCell = sheet.getCell("A2");
  filterCell.value = `Filtered by: ${filterLabel}`;
  filterCell.font = { size: 11, italic: true };
  filterCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  sheet.getRow(2).height = 20;

  // Row 3: spacer
  sheet.getRow(3).height = 8;

  // Row 4: column headers
  const headerRow = sheet.getRow(4);
  columns.forEach((column, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = column.xlsxHeader ?? column.header;
    cell.font = { bold: true, size: 12 };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = fillOf(HEADER_BG);
  });
  headerRow.height = 22;

  // Data rows (grouped or flat)
  let rowNum = 5;
  const writeRows = (groupRows: ReportRowData[]) => {
    groupRows.forEach((r, idx) => {
      const row = sheet.getRow(rowNum);
      const tintName = config.rowTint
        ? config.rowTint.tints[String(r[config.rowTint.key] ?? "")]
        : undefined;
      const stripeBg = idx % 2 === 0 ? ALT_ROW_BG : WHITE;
      const fill = fillOf(tintName ? TINT_ARGB[tintName] : stripeBg);
      columns.forEach((column, i) => {
        writeDataCell(row.getCell(i + 1), column, r[column.key] ?? null, fill);
      });
      row.height = 18;
      rowNum += 1;
    });
  };

  if (config.groupBy) {
    const groups = new Map<string, ReportRowData[]>();
    rows.forEach((r) => {
      const key = String(r[config.groupBy as string] ?? "—");
      const bucket = groups.get(key);
      if (bucket) bucket.push(r);
      else groups.set(key, [r]);
    });

    const totalsInHeader = config.groupTotals === "header";
    const firstSumIdx = columns.findIndex((c) => c.sum);
    const labelSpan = firstSumIdx === -1 ? columns.length : firstSumIdx;

    for (const [groupName, groupRows] of groups) {
      // Group header row: label (+ subtotals when groupTotals: "header")
      const headerSpan = totalsInHeader ? labelSpan : columns.length;
      if (headerSpan > 1) {
        sheet.mergeCells(`A${rowNum}:${colLetter(headerSpan)}${rowNum}`);
      }
      const groupRow = sheet.getRow(rowNum);
      const groupCell = groupRow.getCell(1);
      groupCell.value = groupName;
      groupCell.font = { bold: true, size: totalsInHeader ? 12 : 13 };
      groupCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      groupCell.fill = fillOf(HEADER_BG);
      if (totalsInHeader) {
        columns.forEach((column, i) => {
          if (!column.sum) return;
          const cell = groupRow.getCell(i + 1);
          cell.value = groupRows.reduce(
            (sum, r) => sum + (Number(r[column.key]) || 0),
            0
          );
          cell.numFmt = column.format === "currency" ? CURRENCY_FMT : column.format === "hours" ? "#,##0.00" : "0";
          cell.font = { bold: true, size: 12 };
          cell.alignment = { horizontal: "right", vertical: "middle" };
          cell.fill = fillOf(HEADER_BG);
        });
      }
      sheet.getRow(rowNum).height = 20;
      rowNum += 1;

      writeRows(groupRows);

      if (config.totalsRow && !totalsInHeader) {
        writeTotalsRow(sheet, rowNum, `${groupName} Total`, columns, groupRows);
        rowNum += 1;
      }
    }
  } else {
    writeRows(rows);
  }

  if (config.totalsRow) {
    writeTotalsRow(
      sheet,
      rowNum,
      config.totalsLabel ?? "Grand Total",
      columns,
      rows
    );
  }

  // Write buffer → trigger browser download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${config.fileSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
