import { describe, it, expect } from "vitest";
import { NUM } from "../num";

describe("NUM", () => {
  it("passes through finite numbers", () => {
    expect(NUM(42)).toBe(42);
    expect(NUM(-3.14)).toBe(-3.14);
  });

  it("coerces numeric strings", () => {
    expect(NUM("19")).toBe(19);
    expect(NUM("0.5")).toBe(0.5);
  });

  it("returns 0 for non-numeric strings", () => {
    expect(NUM("abc")).toBe(0);
    expect(NUM("")).toBe(0);
  });

  it("returns 0 for null/undefined", () => {
    expect(NUM(null)).toBe(0);
    expect(NUM(undefined)).toBe(0);
  });

  it("returns 0 for NaN", () => {
    expect(NUM(NaN)).toBe(0);
  });

  it("coerces booleans (true=1, false=0)", () => {
    expect(NUM(true)).toBe(1);
    expect(NUM(false)).toBe(0);
  });
});
