/**
 * assertAuthenticated — server action auth gate tests
 * SA-QA-02 + SA-5.2: Mitigates risk of the auth guard being bypassed
 * or silently broken. This function is the second layer of defense in
 * every server action (after the server layout redirect).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const getUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

// Must import after the mock is registered.
import {
  assertAdmin,
  assertAuthenticated,
  AuthError,
} from "./require-admin";

function userWith(
  role: string | undefined,
  overrides: Partial<User> = {}
): User {
  return {
    id: "user-id",
    email: "user@example.com",
    app_metadata: role === undefined ? {} : { role },
    ...overrides,
  } as unknown as User;
}

describe("assertAuthenticated — auth gate (SA-QA-02 / SA-5.2)", () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  describe("authenticated path", () => {
    it("returns the user object when a session is present", async () => {
      const user = userWith("user");
      getUserMock.mockResolvedValue({
        data: { user },
        error: null,
      });

      const result = await assertAuthenticated();
      expect(result).toBe(user);
      expect(result.id).toBe("user-id");
    });

    it("does not redirect or short-circuit on success — pure return", async () => {
      getUserMock.mockResolvedValue({
        data: { user: userWith("user") },
        error: null,
      });

      // Calling twice in a row works — there's no implicit Next redirect side effect.
      await expect(assertAuthenticated()).resolves.toBeDefined();
      await expect(assertAuthenticated()).resolves.toBeDefined();
    });

    it("returns the user even when role is missing (assertAuthenticated does not enforce role)", async () => {
      getUserMock.mockResolvedValue({
        data: { user: userWith(undefined) },
        error: null,
      });

      const user = await assertAuthenticated();
      expect(user.id).toBe("user-id");
    });
  });

  describe("unauthenticated / error paths", () => {
    it("throws an AuthError instance when there is no user", async () => {
      getUserMock.mockResolvedValue({ data: { user: null }, error: null });

      await expect(assertAuthenticated()).rejects.toBeInstanceOf(AuthError);
    });

    it("throws AuthError with code UNAUTHENTICATED (typed result discrimination)", async () => {
      getUserMock.mockResolvedValue({ data: { user: null }, error: null });

      try {
        await assertAuthenticated();
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(AuthError);
        if (err instanceof AuthError) {
          expect(err.code).toBe("UNAUTHENTICATED");
          expect(err.name).toBe("AuthError");
          expect(typeof err.message).toBe("string");
          expect(err.message.length).toBeGreaterThan(0);
        }
      }
    });

    it("throws UNAUTHENTICATED (not FORBIDDEN) when getUser returns an error — no info leak", async () => {
      getUserMock.mockResolvedValue({
        data: { user: null },
        error: { message: "JWT expired", name: "AuthApiError" },
      });

      await expect(assertAuthenticated()).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });

    it("does not surface the raw Supabase error message (defensive)", async () => {
      getUserMock.mockResolvedValue({
        data: { user: null },
        error: { message: "internal-token-decoding-failure-abc123" },
      });

      await expect(assertAuthenticated()).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
        message: expect.not.stringContaining("internal-token-decoding-failure"),
      });
    });
  });
});

describe("assertAdmin — role gate (SA-QA-02 / SA-5.2)", () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  it("returns the user when role is admin", async () => {
    getUserMock.mockResolvedValue({
      data: { user: userWith("admin") },
      error: null,
    });

    const user = await assertAdmin();
    expect(user.app_metadata?.role).toBe("admin");
  });

  it("throws FORBIDDEN when an authenticated non-admin tries to pass the admin gate", async () => {
    getUserMock.mockResolvedValue({
      data: { user: userWith("user") },
      error: null,
    });

    await expect(assertAdmin()).rejects.toMatchObject({
      name: "AuthError",
      code: "FORBIDDEN",
    });
  });

  it("throws UNAUTHENTICATED (not FORBIDDEN) for a missing session — does not leak the gate", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    // If the gate leaked FORBIDDEN here, an unauthenticated probe could
    // distinguish "user exists but is not admin" from "no session" — a
    // small but real information leak. Cover this explicitly.
    await expect(assertAdmin()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("treats role missing entirely the same as 'user' — FORBIDDEN", async () => {
    getUserMock.mockResolvedValue({
      data: { user: userWith(undefined) },
      error: null,
    });

    await expect(assertAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is case-sensitive — 'Admin' (capital A) is not admin", async () => {
    getUserMock.mockResolvedValue({
      data: { user: userWith("Admin") },
      error: null,
    });

    await expect(assertAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("only reads role from app_metadata (tamper-proof) — not user_metadata", async () => {
    // user_metadata is client-writable. A self-promoted role there must
    // NOT pass the admin gate.
    const sneaky = {
      id: "user-id",
      app_metadata: { role: "user" },
      user_metadata: { role: "admin" },
    } as unknown as User;
    getUserMock.mockResolvedValue({ data: { user: sneaky }, error: null });

    await expect(assertAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("AuthError — typed error contract", () => {
  it("is a real Error subclass (instanceof Error)", () => {
    const err = new AuthError("UNAUTHENTICATED", "no session");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AuthError);
  });

  it("exposes a discriminated `code` field for callers to branch on", () => {
    const a = new AuthError("UNAUTHENTICATED", "x");
    const b = new AuthError("FORBIDDEN", "y");
    expect(a.code).toBe("UNAUTHENTICATED");
    expect(b.code).toBe("FORBIDDEN");
  });

  it("has name 'AuthError' for log/telemetry classification", () => {
    expect(new AuthError("FORBIDDEN", "x").name).toBe("AuthError");
  });
});
