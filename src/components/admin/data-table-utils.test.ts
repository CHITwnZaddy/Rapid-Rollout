import { describe, expect, it } from "vitest";
import {
  buildNewRow,
  normalizeEditableValue,
  type ColumnDef,
} from "./data-table-utils";

const numberColumn: ColumnDef = {
  key: "rate",
  label: "Rate ($/hr)",
  type: "number",
};

describe("normalizeEditableValue", () => {
  it("parses valid numeric input", () => {
    expect(normalizeEditableValue("125.5", numberColumn)).toEqual({
      ok: true,
      value: 125.5,
    });
  });

  it("rejects an empty numeric input instead of silently coercing to 0", () => {
    expect(normalizeEditableValue("   ", numberColumn)).toEqual({
      ok: false,
      error: "Rate ($/hr) can't be blank — enter a number (0 for zero).",
    });
  });

  it("rejects invalid numeric input instead of silently coercing to 0", () => {
    expect(normalizeEditableValue("abc", numberColumn)).toEqual({
      ok: false,
      error: "Rate ($/hr) must be a valid number.",
    });
  });

  it("preserves text input as-is", () => {
    expect(
      normalizeEditableValue("Master", {
        key: "rate_card_name",
        label: "Rate Card",
        type: "text",
      })
    ).toEqual({
      ok: true,
      value: "Master",
    });
  });
});

describe("buildNewRow", () => {
  it("replaces __AUTO__ tokens and fills in missing column defaults", () => {
    const columns: ColumnDef[] = [
      { key: "service_name", label: "Service Name", type: "text" },
      { key: "rate", label: "Rate", type: "number" },
      { key: "lookup_key", label: "Lookup Key", type: "text" },
    ];

    expect(
      buildNewRow(
        columns,
        {
          service_name: "Discovery",
          lookup_key: "Master|Discovery__AUTO__",
        },
        1700000000000
      )
    ).toEqual({
      service_name: "Discovery",
      lookup_key: "Master|Discovery1700000000000",
      rate: 0,
    });
  });
});
