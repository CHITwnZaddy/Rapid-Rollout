import { describe, expect, it } from "vitest";
import { ceilHours, roundMoney, roundPercent } from "@/lib/calculations/rounding";

describe("roundMoney", () => {
  it("rounds to the nearest cent", () => {
    expect(roundMoney(14343.751)).toBe(14343.75);
    expect(roundMoney(14343.755)).toBe(14343.76);
    expect(roundMoney(0.005)).toBe(0.01);
  });

  it("handles float artifacts", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.005)).toBe(1.01);
  });

  it("returns 0 for non-finite input", () => {
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney(Infinity)).toBe(0);
  });
});

describe("roundPercent", () => {
  it("rounds to 2 decimals", () => {
    expect(roundPercent(35.333333)).toBe(35.33);
    expect(roundPercent(35.335)).toBe(35.34);
    expect(roundPercent(50)).toBe(50);
  });

  it("returns 0 for non-finite input", () => {
    expect(roundPercent(NaN)).toBe(0);
  });
});

describe("ceilHours", () => {
  // Business rule: hours ALWAYS round up — estimation error lands
  // in our favor. Canonical examples from Austin (2026-06-10).
  it("always rounds up to the whole hour", () => {
    expect(ceilHours(42.05)).toBe(43);
    expect(ceilHours(42.35)).toBe(43);
    expect(ceilHours(26.45)).toBe(27);
    expect(ceilHours(26.23)).toBe(27);
  });

  it("leaves exact whole numbers alone", () => {
    expect(ceilHours(43)).toBe(43);
    expect(ceilHours(0)).toBe(0);
  });

  it("treats float dust on a whole number as that whole number", () => {
    expect(ceilHours(43.000000000000007)).toBe(43);
    expect(ceilHours(42.999999999999993)).toBe(43);
  });

  it("returns 0 for non-finite input", () => {
    expect(ceilHours(NaN)).toBe(0);
  });
});
