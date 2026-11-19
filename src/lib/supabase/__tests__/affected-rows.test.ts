import { describe, expect, it } from "vitest";
import {
  checkAffectedRows,
  isRowLevelSecurityError,
  PROPOSAL_CHANGE_NOT_SAVED,
} from "../affected-rows";

describe("PROPOSAL_CHANGE_NOT_SAVED", () => {
  it("tells the user the change wasn't saved and why, without blaming permissions", () => {
    expect(PROPOSAL_CHANGE_NOT_SAVED).toBe(
      "This change wasn't saved. The proposal may have been deleted, or you may have been signed out. Reload the page and try again."
    );
  });
});

describe("checkAffectedRows", () => {
  it("passes when at least one row was written", () => {
    expect(
      checkAffectedRows({ error: null, count: 1 }, PROPOSAL_CHANGE_NOT_SAVED)
    ).toEqual({ ok: true });
  });

  it("reports the not-saved message when the write matched no row", () => {
    expect(
      checkAffectedRows({ error: null, count: 0 }, PROPOSAL_CHANGE_NOT_SAVED)
    ).toEqual({ ok: false, error: PROPOSAL_CHANGE_NOT_SAVED });
  });

  it("treats a missing count as a failure, not a success", () => {
    expect(
      checkAffectedRows({ error: null, count: null }, PROPOSAL_CHANGE_NOT_SAVED)
    ).toEqual({ ok: false, error: PROPOSAL_CHANGE_NOT_SAVED });
  });

  it("surfaces the database error first", () => {
    expect(
      checkAffectedRows(
        { error: { message: "boom" }, count: 0 },
        PROPOSAL_CHANGE_NOT_SAVED
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
