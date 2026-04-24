import type ExcelJS from "exceljs";

// exceljs doesn't expose a sheet_to_json equivalent. This matches the
// behavior the seed script relied on under the old xlsx package: row 1
// is the header row, each subsequent non-empty row becomes a
// {header: cellValue} object. Rich-text / formula / hyperlink cells are
// unwrapped to their plain primitive so downstream String()/Number()
// coercions keep working the same way they did before the port.
export function sheetToJson(
  worksheet: ExcelJS.Worksheet | undefined
): Record<string, unknown>[] {
  if (!worksheet) return [];
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(unwrapCellValue(cell.value) ?? "");
  });
  const out: Record<string, unknown>[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    let hasAny = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      const v = unwrapCellValue(cell.value);
      if (v !== null && v !== undefined && v !== "") {
        obj[header] = v;
        hasAny = true;
      }
    });
    if (hasAny) out.push(obj);
  });
  return out;
}

function unwrapCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "object") {
    if ("richText" in value) {
      return value.richText.map((r) => r.text).join("");
    }
    if ("text" in value) return (value as { text: string }).text;
    if ("result" in value) {
      return (value as { result: unknown }).result;
    }
    if (value instanceof Date) return value;
  }
  return value;
}
