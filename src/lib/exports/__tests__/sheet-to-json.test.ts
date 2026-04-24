import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { sheetToJson } from "../sheet-to-json";

// Round-trip test: build a workbook in memory, serialize to buffer,
// re-read it, and confirm sheetToJson produces the same shape the seed
// script consumed under the old xlsx package. This pins the exceljs
// behavior the port depends on (row 1 = headers, numeric cells stay
// numeric, empty rows skipped, missing sheets return []).
async function roundTrip(rows: Record<string, unknown>[], headers: string[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(headers);
  for (const r of rows) {
    ws.addRow(headers.map((h) => r[h] ?? null));
  }
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf as ArrayBuffer);
  return sheetToJson(wb2.getWorksheet("Sheet1"));
}

describe("sheetToJson", () => {
  it("returns [] for a missing sheet", () => {
    expect(sheetToJson(undefined)).toEqual([]);
  });

  it("reads headers from row 1 and maps each row to an object", async () => {
    const out = await roundTrip(
      [
        { Name: "Alice", Age: 30 },
        { Name: "Bob", Age: 25 },
      ],
      ["Name", "Age"]
    );
    expect(out).toEqual([
      { Name: "Alice", Age: 30 },
      { Name: "Bob", Age: 25 },
    ]);
  });

  it("keeps numeric cells as numbers (not stringified)", async () => {
    const out = await roundTrip([{ Rate: 150.5 }], ["Rate"]);
    expect(out).toHaveLength(1);
    expect(typeof out[0].Rate).toBe("number");
    expect(out[0].Rate).toBe(150.5);
  });

  it("skips rows that have no values after the header row", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["Name", "Age"]);
    ws.addRow(["Alice", 30]);
    ws.addRow([]);
    ws.addRow(["Bob", 25]);
    const buf = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf as ArrayBuffer);
    const out = sheetToJson(wb2.getWorksheet("Sheet1"));
    expect(out).toEqual([
      { Name: "Alice", Age: 30 },
      { Name: "Bob", Age: 25 },
    ]);
  });

  it("omits missing cells so downstream ?? defaults fire", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["A", "B", "C"]);
    ws.addRow(["x", null, "z"]);
    const buf = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf as ArrayBuffer);
    const out = sheetToJson(wb2.getWorksheet("Sheet1"));
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ A: "x", C: "z" });
    expect("B" in out[0]).toBe(false);
  });

  it("unwraps rich-text cells to plain strings", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["Label"]);
    ws.getRow(2).getCell(1).value = {
      richText: [
        { text: "Hello " },
        { text: "world", font: { bold: true } },
      ],
    };
    const buf = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf as ArrayBuffer);
    const out = sheetToJson(wb2.getWorksheet("Sheet1"));
    expect(out).toEqual([{ Label: "Hello world" }]);
  });
});
