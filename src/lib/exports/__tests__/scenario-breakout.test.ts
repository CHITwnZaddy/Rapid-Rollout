import { afterEach, describe, it, expect, vi } from "vitest";
import {
  buildScenarioBreakoutWorkbook,
  downloadScenarioBreakoutXLSX,
  scenarioBreakoutFileName,
} from "../scenario-breakout";

describe("scenarioBreakoutFileName", () => {
  it("includes proposal name and ISO date", () => {
    const name = scenarioBreakoutFileName("Acme");
    expect(name).toMatch(/^scenario-breakout-Acme-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

describe("buildScenarioBreakoutWorkbook", () => {
  it("builds the Scenario Breakout sheet without DOM/Blob APIs", async () => {
    const workbook = await buildScenarioBreakoutWorkbook({
      proposalName: "Acme",
      scenarioGroups: [
        {
          scenarioType: "P1",
          lines: [
            { module: "Financials", scope_selection: "Small", total_cost: 1000 },
          ],
          totalCost: 1000,
        },
      ],
      scopedLines: [{ service_type: "01 Data Fix", description: "x", cost: 250 }],
      migrationRows: [{ label: "Project", total: 500 }],
      migrationGrandTotal: 500,
    });

    const sheet = workbook.getWorksheet("Scenario Breakout");
    expect(sheet).toBeDefined();
    expect(sheet!.rowCount).toBeGreaterThan(0);
  });
});

describe("downloadScenarioBreakoutXLSX", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("revokes the object URL only after the click has been dispatched", async () => {
    // Fake only the timer APIs under test; full fake timers can hang ExcelJS/JSZip.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const anchor = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:breakout");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const workbook = {
      xlsx: { writeBuffer: vi.fn(async () => new ArrayBuffer(8)) },
    } as never;

    await downloadScenarioBreakoutXLSX(workbook, "breakout.xlsx");

    expect(anchor.href).toBe("blob:breakout");
    expect(anchor.download).toBe("breakout.xlsx");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revoke).toHaveBeenCalledWith("blob:breakout");
  });
});
