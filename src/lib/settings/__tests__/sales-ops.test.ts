import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertManagerOrAdminMock, createAdminClientMock, createClientMock } =
  vi.hoisted(() => ({
    assertManagerOrAdminMock: vi.fn(),
    createAdminClientMock: vi.fn(),
    createClientMock: vi.fn(),
  }));

vi.mock("@/lib/auth/require-admin", () => ({
  assertManagerOrAdmin: assertManagerOrAdminMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import {
  listKpiUserTargets,
  listKpiYearTargets,
  listSettingsUsers,
  listStaleThresholds,
  listVarianceReasons,
} from "../sales-ops";

function queryResult(data: unknown[]) {
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({ data, error: null })),
    })),
  };
}

function twoOrderQueryResult(data: unknown[]) {
  return {
    select: vi.fn(() => {
      const firstOrder = vi.fn(() => ({
        order: vi.fn(() => ({ data, error: null })),
      }));
      return { order: firstOrder };
    }),
  };
}

describe("sales ops settings loaders", () => {
  beforeEach(() => {
    assertManagerOrAdminMock.mockReset();
    createClientMock.mockReset();
    createAdminClientMock.mockReset();
    assertManagerOrAdminMock.mockResolvedValue({ id: "manager-1" });
  });

  it("loads KPI year targets ordered by calendar year", async () => {
    const from = vi.fn(() => queryResult([{ year: 2026 }]));
    createClientMock.mockResolvedValue({ from });

    await expect(listKpiYearTargets()).resolves.toEqual([{ year: 2026 }]);
    expect(assertManagerOrAdminMock).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("kpi_year_targets");
  });

  it("loads KPI user targets ordered by year and user", async () => {
    const from = vi.fn(() => twoOrderQueryResult([{ user_id: "user-1" }]));
    createClientMock.mockResolvedValue({ from });

    await expect(listKpiUserTargets()).resolves.toEqual([
      { user_id: "user-1" },
    ]);
    expect(from).toHaveBeenCalledWith("kpi_user_targets");
  });

  it("loads users with id, email, and role for target assignment", async () => {
    createAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({
            data: {
              users: [
                {
                  id: "user-1",
                  email: "se@example.com",
                  app_metadata: { role: "user" },
                },
              ],
            },
            error: null,
          })),
        },
      },
    });

    await expect(listSettingsUsers()).resolves.toEqual([
      { id: "user-1", email: "se@example.com", role: "user" },
    ]);
  });

  it("loads stale thresholds", async () => {
    const from = vi.fn(() => queryResult([{ status: "Discovery" }]));
    createClientMock.mockResolvedValue({ from });

    await expect(listStaleThresholds()).resolves.toEqual([
      { status: "Discovery" },
    ]);
    expect(from).toHaveBeenCalledWith("proposal_stale_thresholds");
  });

  it("loads variance reasons", async () => {
    const from = vi.fn(() => queryResult([{ code: "ae_discount" }]));
    createClientMock.mockResolvedValue({ from });

    await expect(listVarianceReasons()).resolves.toEqual([
      { code: "ae_discount" },
    ]);
    expect(from).toHaveBeenCalledWith("proposal_variance_reasons");
  });
});
