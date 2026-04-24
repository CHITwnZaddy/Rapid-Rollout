import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertAdminMock,
  assertAuthenticatedMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  assertAdminMock: vi.fn(),
  assertAuthenticatedMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

type CustomerRow = {
  id: string;
  company_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type RateCardRow = {
  id: string;
  rate_card_name: string;
  activity: string;
  rate: number;
  role_category: string;
  status: string;
  lookup_key: string;
};

type ServiceHoursRow = {
  id: string;
  service_name: string;
  scope_value: string;
  scope_label: string;
  sr_im_hours: number;
  pm_hours: number;
  ba_hours: number;
  service_group: string;
  status: string;
  lookup_key: string;
};

let customersRows: CustomerRow[] = [];
let rateCardRows: RateCardRow[] = [];
let serviceHoursRows: ServiceHoursRow[] = [];

function createTableApi(tableName: string) {
  const getRows = () => {
    if (tableName === "customers") return customersRows;
    if (tableName === "rate_cards") return rateCardRows;
    if (tableName === "service_hours") return serviceHoursRows;
    throw new Error(`Unexpected table ${tableName}`);
  };

  const setRows = (rows: typeof customersRows | typeof rateCardRows | typeof serviceHoursRows) => {
    if (tableName === "customers") {
      customersRows = rows as CustomerRow[];
      return;
    }
    if (tableName === "rate_cards") {
      rateCardRows = rows as RateCardRow[];
      return;
    }
    if (tableName === "service_hours") {
      serviceHoursRows = rows as ServiceHoursRow[];
      return;
    }
    throw new Error(`Unexpected table ${tableName}`);
  };

  return {
    select() {
      return {
        eq(_column: string, value: string) {
          return {
            async maybeSingle() {
              const row = getRows().find((candidate) => candidate.id === value) ?? null;
              return { data: row, error: null };
            },
          };
        },
      };
    },
    insert(payload: Record<string, unknown>) {
      const newRow = {
        id:
          tableName === "customers"
            ? "11111111-1111-4111-8111-111111111113"
            : tableName === "rate_cards"
              ? "22222222-2222-4222-8222-222222222223"
              : "33333333-3333-4333-8333-333333333333",
        ...payload,
      };
      setRows([...getRows(), newRow]);
      return {
        select() {
          return {
            async single() {
              return { data: newRow, error: null };
            },
          };
        },
      };
    },
    update(payload: Record<string, unknown>) {
      return {
        async eq(_column: string, value: string) {
          setRows(
            getRows().map((row) =>
              row.id === value ? { ...row, ...payload } : row
            )
          );
          return { error: null };
        },
      };
    },
    delete() {
      return {
        async eq(_column: string, value: string) {
          setRows(getRows().filter((row) => row.id !== value));
          return { error: null };
        },
      };
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(tableName: string) {
      return createTableApi(tableName);
    },
  })),
}));

vi.mock("@/lib/auth/require-admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-admin")>(
    "@/lib/auth/require-admin"
  );

  return {
    ...actual,
    assertAdmin: assertAdminMock,
    assertAuthenticated: assertAuthenticatedMock,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { AuthError } from "@/lib/auth/require-admin";
import {
  addAdminTableRow,
  deleteAdminTableRow,
  updateAdminTableCell,
} from "./actions";

describe("admin data table actions", () => {
  beforeEach(() => {
    assertAdminMock.mockReset();
    assertAuthenticatedMock.mockReset();
    revalidatePathMock.mockReset();

    assertAdminMock.mockResolvedValue({ id: "admin-1" });
    assertAuthenticatedMock.mockResolvedValue({ id: "user-1" });

    customersRows = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        company_name: "Acme",
        address_line1: "",
        address_line2: "",
        city: "Austin",
        state: "TX",
        zip: "78701",
      },
    ];
    rateCardRows = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        rate_card_name: "Master",
        activity: "Program Manager",
        rate: 250,
        role_category: "PM",
        status: "Active",
        lookup_key: "Master|Program Manager",
      },
    ];
    serviceHoursRows = [
      {
        id: "33333333-3333-4333-8333-333333333332",
        service_name: "Service",
        scope_value: "Included",
        scope_label: "Included",
        sr_im_hours: 1,
        pm_hours: 1,
        ba_hours: 1,
        service_group: "Core",
        status: "Active",
        lookup_key: "Service|Included",
      },
    ];
  });

  it("allows authenticated users to update shared customers", async () => {
    const result = await updateAdminTableCell(
      "customers",
      "11111111-1111-4111-8111-111111111111",
      "company_name",
      "New Name"
    );

    expect(result).toEqual({
      ok: true,
      row: expect.objectContaining({ company_name: "New Name" }),
    });
    expect(assertAuthenticatedMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/customers");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/customers");
  });

  it("rejects non-admin callers for admin-only tables", async () => {
    assertAdminMock.mockRejectedValue(
      new AuthError("FORBIDDEN", "Admin access required.")
    );

    const result = await updateAdminTableCell(
      "rate_cards",
      "22222222-2222-4222-8222-222222222222",
      "rate",
      "275"
    );

    expect(result).toEqual({
      ok: false,
      error: "Admin access required for this table.",
    });
  });

  it("normalizes numeric edits before saving", async () => {
    const result = await updateAdminTableCell(
      "rate_cards",
      "22222222-2222-4222-8222-222222222222",
      "rate",
      "275"
    );

    expect(result).toEqual({
      ok: true,
      row: expect.objectContaining({ rate: 275 }),
    });
  });

  it("adds rows using the table defaults and auto token replacement", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(123456);

    const result = await addAdminTableRow("service_hours");

    expect(result).toEqual({
      ok: true,
      row: expect.objectContaining({
        service_name: "New Service",
        scope_value: "Included",
        lookup_key: "NewService|Included123456",
      }),
    });
  });

  it("deletes rows and revalidates the matching table pages", async () => {
    const result = await deleteAdminTableRow(
      "service_hours",
      "33333333-3333-4333-8333-333333333332"
    );

    expect(result).toEqual({ ok: true });
    expect(serviceHoursRows).toHaveLength(0);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/service-hours");
  });
});
