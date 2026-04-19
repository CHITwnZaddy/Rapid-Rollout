import { describe, it, expect } from "vitest";
import { scopeTier, sortScopeOptions } from "../scope-option-sort";

describe("scopeTier", () => {
  it("returns 0 for prompt rows", () => {
    expect(scopeTier("Select # of Processes")).toBe(0);
    expect(scopeTier("Click here to choose")).toBe(0);
  });
  it("returns 1 for pure numeric labels", () => {
    expect(scopeTier("1")).toBe(1);
    expect(scopeTier("42")).toBe(1);
  });
  it("returns 3 for 'Included with no...' sentinels", () => {
    expect(scopeTier("Included with no additional cost")).toBe(3);
  });
  it("returns 2 for descriptive labels", () => {
    expect(scopeTier("Basic workflow")).toBe(2);
    expect(scopeTier("Custom scope")).toBe(2);
  });
});

describe("sortScopeOptions", () => {
  it("puts prompt row first, numeric in order, included-with-no last", () => {
    const input = [
      { value: "19", label: "19" },
      { value: "Select", label: "Select # of Processes" },
      { value: "2", label: "2" },
      { value: "Incl", label: "Included with no extra cost" },
      { value: "Custom", label: "Custom build" },
      { value: "1", label: "1" },
    ];
    const sorted = sortScopeOptions(input).map((o) => o.label);
    expect(sorted).toEqual([
      "Select # of Processes",
      "1",
      "2",
      "19",
      "Custom build",
      "Included with no extra cost",
    ]);
  });

  it("does not mutate input array", () => {
    const input = [
      { value: "b", label: "b" },
      { value: "a", label: "a" },
    ];
    const snapshot = [...input];
    sortScopeOptions(input);
    expect(input).toEqual(snapshot);
  });

  it("handles empty and single-item lists", () => {
    expect(sortScopeOptions([])).toEqual([]);
    expect(sortScopeOptions([{ value: "x", label: "x" }])).toEqual([
      { value: "x", label: "x" },
    ]);
  });
});
