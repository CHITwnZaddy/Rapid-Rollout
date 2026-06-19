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
  submitUpdateVarianceReason,
  updateVarianceReason,
} from "./actions";
import { SEEDED_VARIANCE_REASON_CODES } from "@/lib/settings/sales-ops-constants";

const reasonId = "11111111-1111-4111-8111-111111111111";

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

function mockUpdate() {
  const codeEq = vi.fn(async () => ({ error: null }));
  const idEq = vi.fn(() => ({ eq: codeEq }));
  const update = vi.fn(() => ({ eq: idEq }));
  const from = vi.fn(() => ({ update }));
  createClientMock.mockResolvedValue({ from });
  return { from, update, idEq, codeEq };
}

describe("variance reason actions", () => {
  beforeEach(() => {
    assertManagerOrAdminMock.mockReset();
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
    assertManagerOrAdminMock.mockResolvedValue({ id: "manager-1" });
  });

  it("blocks SEs from editing reasons", async () => {
    assertManagerOrAdminMock.mockRejectedValue(
      new AuthError("FORBIDDEN", "Manager or admin access required.")
    );

    const result = await updateVarianceReason(
      form({
        id: reasonId,
        code: "ae_discount",
        label: "AE discount",
        description: "Sr. AE discounted before signature",
        sortOrder: "10",
        isActive: "true",
      })
    );

    expect(result).toEqual({
      ok: false,
      error: "Manager or admin access required.",
    });
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("allows managers to edit active state, label, description, and sort order", async () => {
    const { from, update, idEq, codeEq } = mockUpdate();

    const result = await updateVarianceReason(
      form({
        id: reasonId,
        code: "ae_discount",
        label: "AE discount",
        description: "Discount before signature",
        sortOrder: "15",
        isActive: "false",
      })
    );

    expect(result).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("proposal_variance_reasons");
    expect(update).toHaveBeenCalledWith({
      label: "AE discount",
      description: "Discount before signature",
      sort_order: 15,
      is_active: false,
    });
    expect(idEq).toHaveBeenCalledWith("id", reasonId);
    expect(codeEq).toHaveBeenCalledWith("code", "ae_discount");
  });

  it("allows admins to edit reasons", async () => {
    assertManagerOrAdminMock.mockResolvedValue({ id: "admin-1" });
    mockUpdate();

    const result = await updateVarianceReason(
      form({
        id: reasonId,
        code: "scope_removed",
        label: "Scope removed",
        description: "Client removed optional work",
        sortOrder: "20",
        isActive: "true",
      })
    );

    expect(result).toEqual({ ok: true });
  });

  it("rejects a blank reason code", async () => {
    mockUpdate();

    const result = await updateVarianceReason(
      form({
        id: reasonId,
        code: "",
        label: "AE discount",
        description: "Sr. AE discounted before signature",
        sortOrder: "10",
        isActive: "true",
      })
    );

    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("does not include an Other seed reason", () => {
    expect(SEEDED_VARIANCE_REASON_CODES).not.toContain("other");
  });

  it("submit wrapper surfaces failures instead of swallowing them", async () => {
    mockUpdate();

    const result = await submitUpdateVarianceReason(
      { ok: true },
      form({
        id: reasonId,
        code: "",
        label: "AE discount",
        description: "Sr. AE discounted before signature",
        sortOrder: "10",
        isActive: "true",
      })
    );

    expect(result.ok).toBe(false);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("submit wrapper returns ok on a valid save", async () => {
    mockUpdate();

    const result = await submitUpdateVarianceReason(
      { ok: true },
      form({
        id: reasonId,
        code: "ae_discount",
        label: "AE discount",
        description: "Discount before signature",
        sortOrder: "15",
        isActive: "false",
      })
    );

    expect(result).toEqual({ ok: true });
  });
});
