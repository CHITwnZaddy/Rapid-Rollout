import { describe, it, expect } from "vitest";
import {
  scenarioBreakoutFileName,
} from "../scenario-breakout";

describe("scenarioBreakoutFileName", () => {
  it("includes proposal name and ISO date", () => {
    const name = scenarioBreakoutFileName("Acme");
    expect(name).toMatch(/^scenario-breakout-Acme-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
