import { describe, expect, it } from "vitest";
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { shouldLogAuthError } from "../auth-errors";

describe("shouldLogAuthError", () => {
  it("does not log the signed-out case (no session cookie)", () => {
    expect(shouldLogAuthError(new AuthSessionMissingError())).toBe(false);
  });

  it("logs a rejected token from the auth server", () => {
    expect(
      shouldLogAuthError(
        new AuthApiError("invalid JWT", 403, "bad_jwt")
      )
    ).toBe(true);
  });

  it("logs a network failure reaching the auth server", () => {
    expect(
      shouldLogAuthError(new AuthRetryableFetchError("fetch failed", 0))
    ).toBe(true);
  });

  it("logs a non-auth error even if its message looks like a missing session", () => {
    // Matching on the library's error type, not the message text, so an
    // unrelated error can't be silenced by accident.
    expect(shouldLogAuthError(new Error("Auth session missing!"))).toBe(true);
  });

  it("has nothing to log when there is no error", () => {
    expect(shouldLogAuthError(null)).toBe(false);
    expect(shouldLogAuthError(undefined)).toBe(false);
  });
});
