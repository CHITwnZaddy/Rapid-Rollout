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

import {
  deleteKpiUserTarget,
  deleteKpiYearTarget,
  updateKpiYearTarget,
  upsertKpiUserTarget,
} from "./actions";

const yearTargetId = "11111111-1111-4111-8111-111111111111";
const userTargetId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function mockUpdate() {
  const eq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  createClientMock.mockResolvedValue({ from });
  return { from, update, eq };
}

function mockUpsert() {
  const upsert = vi.fn(async () => ({ error: null }));
  const from = vi.fn(() => ({ upsert }));
  createClientMock.mockResolvedValue({ from });
  return { from, upsert };
}

function mockDelete() {
  const eq = vi.fn(async () => ({ error: null }));
  const deleteFn = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ delete: deleteFn }));
  createClientMock.mockResolvedValue({ from });
  return { from, deleteFn, eq };
}

describe("KPI target actions", () => {
  beforeEach(() => {
    assertManagerOrAdminMock.mockReset();
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
    assertManagerOrAdminMock.mockResolvedValue({ id: "manager-1" });
  });

  it("blocks SEs from saving KPI targets", async () => {
    assertManagerOrAdminMock.mockRejectedValue(
      new AuthError("FORBIDDEN", "Manager or admin access required.")
    );

    const result = await updateKpiYearTarget(
      form({
        id: yearTargetId,
        year: "2026",
        label: "FY26",
        teamQuota: "8000000",
        isActive: "true",
      })
    );

    expect(result).toEqual({
      ok: false,
      error: "Manager or admin access required.",
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("allows managers to save yearly KPI targets", async () => {
    const { from, update, eq } = mockUpdate();

    const result = await updateKpiYearTarget(
      form({
        id: yearTargetId,
        year: "2026",
        label: "FY26",
        teamQuota: "8000000",
        isActive: "true",
      })
    );

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("kpi_year_targets");
    expect(update).toHaveBeenCalledWith({
      year: 2026,
      label: "FY26",
      team_quota: 8000000,
      is_active: true,
    });
    expect(eq).toHaveBeenCalledWith("id", yearTargetId);
  });

  it("allows admins to save SE KPI targets", async () => {
    assertManagerOrAdminMock.mockResolvedValue({ id: "admin-1" });
    const { from, upsert } = mockUpsert();

    const result = await upsertKpiUserTarget(
      form({
        id: userTargetId,
        year: "2027",
        userId,
        targetAmount: "3500000",
        isActive: "true",
      })
    );

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("kpi_user_targets");
    expect(upsert).toHaveBeenCalledWith(
      {
        id: userTargetId,
        year: 2027,
        user_id: userId,
        target_amount: 3500000,
        is_active: true,
      },
      { onConflict: "year,user_id" }
    );
  });

  it("rejects negative target values", async () => {
    mockUpdate();

    const result = await updateKpiYearTarget(
      form({
        id: yearTargetId,
        year: "2026",
        label: "FY26",
        teamQuota: "-1",
        isActive: "true",
      })
    );

    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("requires a calendar year", async () => {
    mockUpdate();

    const result = await updateKpiYearTarget(
      form({
        id: yearTargetId,
        year: "FY26",
        label: "FY26",
        teamQuota: "8000000",
        isActive: "true",
      })
    );

    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("allows managers to delete yearly KPI targets", async () => {
    const { from, deleteFn, eq } = mockDelete();

    const result = await deleteKpiYearTarget(form({ id: yearTargetId }));

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("kpi_year_targets");
    expect(deleteFn).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", yearTargetId);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/kpi-targets");
  });

  it("allows managers to delete SE KPI targets", async () => {
    const { from, deleteFn, eq } = mockDelete();

    const result = await deleteKpiUserTarget(form({ id: userTargetId }));

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("kpi_user_targets");
    expect(deleteFn).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", userTargetId);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/kpi-targets");
  });
});
