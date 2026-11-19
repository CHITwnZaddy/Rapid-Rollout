import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authAssertMock,
  fromMock,
  proposalsEqByIdMock,
  proposalsUpdateMock,
  revalidatePathMock,
  scenariosEqByIdMock,
  scenariosUpdateMock,
} = vi.hoisted(() => ({
  authAssertMock: vi.fn(),
  fromMock: vi.fn(),
  proposalsEqByIdMock: vi.fn(),
  proposalsUpdateMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  scenariosEqByIdMock: vi.fn(),
  scenariosUpdateMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: fromMock,
  })),
}));

vi.mock("@/lib/auth/require-admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-admin")>(
    "@/lib/auth/require-admin"
  );

  return {
    ...actual,
    assertAuthenticated: authAssertMock,
    // Mirror the real helper but drive it from the same mock so the
    // resolve/reject setups below control authentication.
    requireAuthenticatedResult: async (message: string) => {
      try {
        const user = await authAssertMock();
        return { ok: true, user };
      } catch {
        return { ok: false, error: message };
      }
    },
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { AuthError } from "@/lib/auth/require-admin";
import { PROPOSAL_CHANGE_NOT_SAVED } from "@/lib/supabase/affected-rows";
import {
  updateScenarioComplexityFactor,
  updateScopedComplexityFactor,
} from "./complexity-actions";

describe("complexity factor actions", () => {
  beforeEach(() => {
    authAssertMock.mockReset();
    fromMock.mockReset();
    proposalsEqByIdMock.mockReset();
    proposalsUpdateMock.mockReset();
    revalidatePathMock.mockReset();
    scenariosEqByIdMock.mockReset();
    scenariosUpdateMock.mockReset();

    authAssertMock.mockResolvedValue({ id: "user-1" });

    scenariosUpdateMock.mockReturnValue({ eq: scenariosEqByIdMock });
    scenariosEqByIdMock.mockResolvedValue({ error: null, count: 1 });

    proposalsUpdateMock.mockReturnValue({ eq: proposalsEqByIdMock });
    proposalsEqByIdMock.mockResolvedValue({ error: null, count: 1 });

    fromMock.mockImplementation((table: string) => {
      if (table === "scenarios") {
        return { update: scenariosUpdateMock };
      }
      if (table === "proposals") {
        return { update: proposalsUpdateMock };
      }
      throw new Error(`Unexpected table mock: ${table}`);
    });
  });

  describe("updateScenarioComplexityFactor", () => {
    it("rejects out-of-range values before calling Supabase", async () => {
      const result = await updateScenarioComplexityFactor(
        "scenario-1",
        "proposal-1",
        0.4
      );

      expect(result).toEqual({
        ok: false,
        error: "Complexity factor must be between 0.50 and 9.99.",
      });
      expect(authAssertMock).not.toHaveBeenCalled();
      expect(fromMock).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated callers", async () => {
      authAssertMock.mockRejectedValue(
        new AuthError("UNAUTHENTICATED", "You must be signed in.")
      );

      const result = await updateScenarioComplexityFactor(
        "scenario-1",
        "proposal-1",
        1.15
      );

      expect(result).toEqual({ ok: false, error: "You must be signed in." });
      expect(fromMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("writes the rounded value with an exact count and revalidates", async () => {
      const result = await updateScenarioComplexityFactor(
        "scenario-1",
        "proposal-1",
        1.234
      );

      expect(result).toEqual({ ok: true });
      expect(scenariosUpdateMock).toHaveBeenCalledWith(
        { complexity_factor: 1.23 },
        { count: "exact" }
      );
      expect(scenariosEqByIdMock).toHaveBeenCalledWith("id", "scenario-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/proposals/proposal-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
    });

    it("reports the change as not saved when the update matches no row (deleted row / ended session)", async () => {
      scenariosEqByIdMock.mockResolvedValue({ error: null, count: 0 });

      const result = await updateScenarioComplexityFactor(
        "scenario-1",
        "proposal-1",
        1.15
      );

      expect(result).toEqual({
        ok: false,
        error: PROPOSAL_CHANGE_NOT_SAVED,
      });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("surfaces database errors without revalidating", async () => {
      scenariosEqByIdMock.mockResolvedValue({
        error: { message: "violates check constraint" },
        count: null,
      });

      const result = await updateScenarioComplexityFactor(
        "scenario-1",
        "proposal-1",
        1.15
      );

      expect(result).toEqual({
        ok: false,
        error: "violates check constraint",
      });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });

  describe("updateScopedComplexityFactor", () => {
    it("rejects out-of-range values before calling Supabase", async () => {
      const result = await updateScopedComplexityFactor("proposal-1", 10);

      expect(result).toEqual({
        ok: false,
        error: "Complexity factor must be between 0.50 and 9.99.",
      });
      expect(authAssertMock).not.toHaveBeenCalled();
      expect(fromMock).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated callers", async () => {
      authAssertMock.mockRejectedValue(
        new AuthError("UNAUTHENTICATED", "You must be signed in.")
      );

      const result = await updateScopedComplexityFactor("proposal-1", 1.15);

      expect(result).toEqual({ ok: false, error: "You must be signed in." });
      expect(fromMock).not.toHaveBeenCalled();
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("writes the rounded value with an exact count and revalidates", async () => {
      const result = await updateScopedComplexityFactor("proposal-1", 1.156);

      expect(result).toEqual({ ok: true });
      expect(proposalsUpdateMock).toHaveBeenCalledWith(
        { scoped_complexity_factor: 1.16 },
        { count: "exact" }
      );
      expect(proposalsEqByIdMock).toHaveBeenCalledWith("id", "proposal-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/proposals/proposal-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
    });

    it("reports the change as not saved when the update matches no row (deleted row / ended session)", async () => {
      proposalsEqByIdMock.mockResolvedValue({ error: null, count: 0 });

      const result = await updateScopedComplexityFactor("proposal-1", 1.15);

      expect(result).toEqual({
        ok: false,
        error: PROPOSAL_CHANGE_NOT_SAVED,
      });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("surfaces database errors without revalidating", async () => {
      proposalsEqByIdMock.mockResolvedValue({
        error: { message: "violates check constraint" },
        count: null,
      });

      const result = await updateScopedComplexityFactor("proposal-1", 1.15);

      expect(result).toEqual({
        ok: false,
        error: "violates check constraint",
      });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  });
});
