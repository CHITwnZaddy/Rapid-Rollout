import { describe, expect, it } from "vitest";
import {
  checkAffectedRows,
  isRowLevelSecurityError,
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

describe("isRowLevelSecurityError", () => {
  it("recognises the Postgres insufficient-privilege code", () => {
    expect(isRowLevelSecurityError({ code: "42501", message: "denied" })).toBe(true);
  });

  it("recognises the RLS message when no code is present", () => {
    expect(
      isRowLevelSecurityError({
        message: 'new row violates row-level security policy for table "scoped_services"',
      })
    ).toBe(true);
  });

  it("ignores other errors and a missing error", () => {
    expect(isRowLevelSecurityError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isRowLevelSecurityError(null)).toBe(false);
  });
});
