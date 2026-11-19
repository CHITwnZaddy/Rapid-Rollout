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

import { submitUpdateStaleThreshold, updateStaleThreshold } from "./actions";
import { ROW_NOT_SAVED } from "@/lib/supabase/affected-rows";

const thresholdId = "11111111-1111-4111-8111-111111111111";

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

// Supabase only fills `count` when the update asked for { count: "exact" };
// RLS refuses a non-manager write with count 0 and no error.
function mockUpdate(
  result: { error: { message: string } | null; count: number | null } = {
    error: null,
    count: 1,
  }
) {
  const statusEq = vi.fn(async () => result);
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
    expect(update).toHaveBeenCalledWith(
      {
        threshold_days: 21,
        is_active: true,
        updated_by: "manager-1",
      },
      { count: "exact" }
    );
    expect(idEq).toHaveBeenCalledWith("id", thresholdId);
    expect(statusEq).toHaveBeenCalledWith("status", "Discovery");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/stale-thresholds");
  });

  it("reports an RLS-refused save (zero rows updated) instead of success", async () => {
    mockUpdate({ error: null, count: 0 });

    const result = await updateStaleThreshold(
      form({
        id: thresholdId,
        status: "Discovery",
        thresholdDays: "21",
        isActive: "true",
      })
    );

    expect(result).toEqual({ ok: false, error: ROW_NOT_SAVED });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("surfaces a database error without revalidating", async () => {
    mockUpdate({ error: { message: "connection reset" }, count: null });

    const result = await updateStaleThreshold(
      form({
        id: thresholdId,
        status: "Discovery",
        thresholdDays: "21",
        isActive: "true",
      })
    );

    expect(result).toEqual({ ok: false, error: "connection reset" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
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

  it("submit wrapper surfaces failures instead of swallowing them", async () => {
    mockUpdate();

    const result = await submitUpdateStaleThreshold(
      { ok: true },
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

  it("submit wrapper returns ok on a valid save", async () => {
    mockUpdate();

    const result = await submitUpdateStaleThreshold(
      { ok: true },
      form({
        id: thresholdId,
        status: "Discovery",
        thresholdDays: "21",
        isActive: "true",
      })
    );

    expect(result).toEqual({ ok: true });
  });

  it("submit wrapper surfaces an RLS-refused save to the form", async () => {
    mockUpdate({ error: null, count: 0 });

    const result = await submitUpdateStaleThreshold(
      { ok: true },
      form({
        id: thresholdId,
        status: "Discovery",
        thresholdDays: "21",
        isActive: "true",
      })
    );

    expect(result).toEqual({ ok: false, error: ROW_NOT_SAVED });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
