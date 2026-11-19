import { describe, expect, it } from "vitest";
import {
  checkAffectedRows,
  PROPOSAL_EDIT_NOT_PERMITTED,
} from "../affected-rows";

describe("checkAffectedRows", () => {
  it("passes when at least one row was written", () => {
    expect(
      checkAffectedRows({ error: null, count: 1 }, PROPOSAL_EDIT_NOT_PERMITTED)
    ).toEqual({ ok: true });
  });

  it("reports the not-permitted message when RLS filtered every row", () => {
    expect(
      checkAffectedRows({ error: null, count: 0 }, PROPOSAL_EDIT_NOT_PERMITTED)
    ).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
  });

  it("treats a missing count as a failure, not a success", () => {
    expect(
      checkAffectedRows({ error: null, count: null }, PROPOSAL_EDIT_NOT_PERMITTED)
    ).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
  });

  it("surfaces the database error first", () => {
    expect(
      checkAffectedRows(
        { error: { message: "boom" }, count: 0 },
        PROPOSAL_EDIT_NOT_PERMITTED
      )
    ).toEqual({ ok: false, error: "boom" });
  });
});
