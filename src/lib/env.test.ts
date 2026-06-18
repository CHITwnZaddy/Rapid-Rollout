import { describe, expect, it } from "vitest";

import { getRequiredEnv } from "./env";

describe("getRequiredEnv", () => {
  it("returns a configured environment variable", () => {
    expect(getRequiredEnv({ EXAMPLE_KEY: "value" }, "EXAMPLE_KEY")).toBe(
      "value"
    );
  });

  it("throws a clear error when the value is missing", () => {
    expect(() => getRequiredEnv({}, "MISSING_KEY")).toThrow(
      "Missing required environment variable: MISSING_KEY"
    );
  });

  it("throws a clear error when the value is empty", () => {
    expect(() => getRequiredEnv({ EMPTY_KEY: "" }, "EMPTY_KEY")).toThrow(
      "Missing required environment variable: EMPTY_KEY"
    );
  });
});
