import { describe, it, expect } from "vitest";
import { toEngineLine } from "../adapters";

describe("toEngineLine", () => {
  const baseRow = {
    id: "row-1",
    section: "workflow",
    label: "Sample workflow",
    quantity: "3",
    items_per_object: "10",
    total_line_items: "30",
    row_order: 2,
  };

  it("coerces string numeric fields through NUM", () => {
    const out = toEngineLine(baseRow);
    expect(out.quantity).toBe(3);
    expect(out.items_per_object).toBe(10);
    expect(out.total_line_items).toBe(30);
  });

  it("preserves id, section, label, row_order", () => {
    const out = toEngineLine(baseRow);
    expect(out.id).toBe("row-1");
    expect(out.section).toBe("workflow");
    expect(out.label).toBe("Sample workflow");
    expect(out.row_order).toBe(2);
  });

  it("applies quantityOverride when provided", () => {
    const out = toEngineLine(baseRow, { quantityOverride: 99 });
    expect(out.quantity).toBe(99);
  });

  it("uses default id '' and row_order 0 for in-memory rows", () => {
    const out = toEngineLine({
      section: "cost",
      label: "travel",
      quantity: 1,
      items_per_object: 1,
      total_line_items: 1,
    });
    expect(out.id).toBe("");
    expect(out.row_order).toBe(0);
  });

  it("respects idDefault and rowOrderDefault opts", () => {
    const out = toEngineLine(
      { section: "cost", label: "x", quantity: 0, items_per_object: 0, total_line_items: 0 },
      { idDefault: "synthetic", rowOrderDefault: 7 }
    );
    expect(out.id).toBe("synthetic");
    expect(out.row_order).toBe(7);
  });

  it("coerces null numeric fields to 0", () => {
    const out = toEngineLine({
      section: "workflow",
      label: "x",
      quantity: null,
      items_per_object: null,
      total_line_items: null,
    });
    expect(out.quantity).toBe(0);
    expect(out.items_per_object).toBe(0);
    expect(out.total_line_items).toBe(0);
  });

  // Business rule: Credit/Discount ($) is always >= 0, even for LoE credits.
  // toEngineLine does NOT enforce this — NUM() passes negatives through unchanged.
  // The invariant is enforced at the DB constraint level and form-layer Zod schema.
  // This test documents the current (pass-through) behavior so future readers know
  // where enforcement lives.
  it("does not clamp negative quantity — caller must enforce non-negative invariant", () => {
    const out = toEngineLine({
      section: "cost",
      label: "credit",
      quantity: -5,
      items_per_object: 10,
      total_line_items: 0,
    });
    expect(out.quantity).toBe(-5); // passes through — see business rule comment above
  });
});
