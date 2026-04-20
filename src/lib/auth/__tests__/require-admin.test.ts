import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";

// Mock the server-client module so the helper's createClient() call
// returns a stub we can script per test. This mirrors the DI-free
// pattern the rest of the server-action layer uses.
const getUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

// Must import *after* the mock is registered.
import { assertAdmin, assertAuthenticated, AuthError } from "../require-admin";

function userWith(role: string | undefined): User {
  return {
    id: "user-id",
    app_metadata: role === undefined ? {} : { role },
  } as unknown as User;
}

describe("require-admin", () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  describe("assertAuthenticated", () => {
    it("returns the user when a session exists", async () => {
      getUserMock.mockResolvedValue({
        data: { user: userWith("user") },
        error: null,
      });
      const user = await assertAuthenticated();
      expect(user.id).toBe("user-id");
    });

    it("throws AuthError(UNAUTHENTICATED) when there is no user", async () => {
      getUserMock.mockResolvedValue({ data: { user: null }, error: null });
      await expect(assertAuthenticated()).rejects.toMatchObject({
        name: "AuthError",
        code: "UNAUTHENTICATED",
      });
    });

    it("throws AuthError(UNAUTHENTICATED) when getUser returns an error", async () => {
      getUserMock.mockResolvedValue({
        data: { user: null },
        error: { message: "JWT expired" },
      });
      await expect(assertAuthenticated()).rejects.toBeInstanceOf(AuthError);
    });
  });

  describe("assertAdmin", () => {
    it("returns the user when role is admin", async () => {
      getUserMock.mockResolvedValue({
        data: { user: userWith("admin") },
        error: null,
      });
      const user = await assertAdmin();
      expect(user.app_metadata?.role).toBe("admin");
    });

    it("throws AuthError(FORBIDDEN) when role is user", async () => {
      getUserMock.mockResolvedValue({
        data: { user: userWith("user") },
        error: null,
      });
      await expect(assertAdmin()).rejects.toMatchObject({
        name: "AuthError",
        code: "FORBIDDEN",
      });
    });

    it("throws AuthError(FORBIDDEN) when role is missing entirely", async () => {
      getUserMock.mockResolvedValue({
        data: { user: userWith(undefined) },
        error: null,
      });
      await expect(assertAdmin()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("throws AuthError(UNAUTHENTICATED) when there is no session (does not leak FORBIDDEN)", async () => {
      getUserMock.mockResolvedValue({ data: { user: null }, error: null });
      await expect(assertAdmin()).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });
  });
});
