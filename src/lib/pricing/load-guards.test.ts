import { describe, expect, it } from "vitest";

import {
  getLoadError,
  getRequiredRateCardsError,
  getUnknownRateLookupError,
} from "./load-guards";

describe("pricing load guards", () => {
  it("surfaces Supabase query failures before pricing can render", () => {
    const error = getLoadError(
      { data: null, error: { message: "connection failed" } },
      "active rate cards"
    );

    expect(error).toBe("Could not load active rate cards: connection failed.");
  });

  it("requires every pricing-critical rate card key", () => {
    const error = getRequiredRateCardsError(
      [{ lookup_key: "Master|Sr. Implementation Manager" }],
      [
        "Master|Sr. Implementation Manager",
        "Master|Program Manager",
        "Master|Business Analyst",
      ],
      "scenario pricing"
    );

    expect(error).toBe(
      "Missing required rate card rows for scenario pricing: Master|Program Manager, Master|Business Analyst."
    );
  });

  it("allows empty result arrays when the query succeeded", () => {
    expect(getLoadError({ data: [], error: null }, "scoped services")).toBeNull();
  });

  it("blocks persisted rows that reference inactive or missing rate cards", () => {
    const error = getUnknownRateLookupError(
      [
        { rate_card_lookup_key: "Master|Program Manager" },
        { rate_card_lookup_key: "Master|Retired Role" },
      ],
      [{ lookup_key: "Master|Program Manager" }],
      (line) => line.rate_card_lookup_key,
      "Scoped Services"
    );

    expect(error).toBe(
      "Scoped Services unavailable: saved rows reference inactive or missing rate card rows: Master|Retired Role."
    );
  });
});
