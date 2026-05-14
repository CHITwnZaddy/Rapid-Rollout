import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/require-admin";

const { assertManagerOrAdminMock, createClientMock, revalidatePathMock } =
  vi.hoisted(() => ({
    assertManagerOrAdminMock: vi.fn(),
    createClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  }));

vi.mock("@/lib/auth/require-admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-admin")>(
    "@/lib/auth/require-admin"
  );
  return {
    ...actual,
    assertManagerOrAdmin: assertManagerOrAdminMock,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { updateStaleThreshold } from "./actions";

const thresholdId = "11111111-1111-4111-8111-111111111111";

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function mockUpdate() {
  const statusEq = vi.fn(async () => ({ error: null }));
  const idEq = vi.fn(() => ({ eq: statusEq }));
  const update = vi.fn(() => ({ eq: idEq }));
  const from = vi.fn(() => ({ update }));
  createClientMock.mockResolvedValue({ from });
  return { from, update, idEq, statusEq };
}

describe("stale threshold actions", () => {
  beforeEach(() => {
    assertManagerOrAdminMock.mockReset();
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
    assertManagerOrAdminMock.mockResolvedValue({ id: "manager-1" });
  });

  it("blocks SEs from saving thresholds", async () => {
    assertManagerOrAdminMock.mockRejectedValue(
      new AuthError("FORBIDDEN", "Manager or admin access required.")
    );

    const result = await updateStaleThreshold(
      form({
        id: thresholdId,
        status: "Discovery",
        thresholdDays: "21",
        isActive: "true",
      })
    );

    expect(result).toEqual({
      ok: false,
      error: "Manager or admin access required.",
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("allows managers to save thresholds", async () => {
    const { from, update, idEq, statusEq } = mockUpdate();

    const result = await updateStaleThreshold(
      form({
        id: thresholdId,
        status: "Discovery",
        thresholdDays: "21",
        isActive: "true",
      })
    );

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("proposal_stale_thresholds");
    expect(update).toHaveBeenCalledWith({
      threshold_days: 21,
      is_active: true,
      updated_by: "manager-1",
    });
    expect(idEq).toHaveBeenCalledWith("id", thresholdId);
    expect(statusEq).toHaveBeenCalledWith("status", "Discovery");
  });

  it("allows admins to save thresholds", async () => {
    assertManagerOrAdminMock.mockResolvedValue({ id: "admin-1" });
    mockUpdate();

    const result = await updateStaleThreshold(
      form({
        id: thresholdId,
        status: "Awaiting Sig",
        thresholdDays: "14",
        isActive: "true",
      })
    );

    expect(result).toEqual({ ok: true });
  });

  it("requires positive integer threshold days", async () => {
    mockUpdate();

    const result = await updateStaleThreshold(
      form({
        id: thresholdId,
        status: "Scoping",
        thresholdDays: "0",
        isActive: "true",
      })
    );

    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("does not save On Hold as a stale threshold", async () => {
    mockUpdate();

    const result = await updateStaleThreshold(
      form({
        id: thresholdId,
        status: "On Hold",
        thresholdDays: "30",
        isActive: "true",
      })
    );

    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
