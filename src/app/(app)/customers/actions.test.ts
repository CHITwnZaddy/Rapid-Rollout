import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authAssertMock,
  insertMock,
  selectMock,
  singleMock,
  fromMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  authAssertMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  fromMock: vi.fn(),
  revalidatePathMock: vi.fn(),
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
import { createCustomer } from "./actions";

describe("createCustomer", () => {
  beforeEach(() => {
    authAssertMock.mockReset();
    insertMock.mockReset();
    selectMock.mockReset();
    singleMock.mockReset();
    fromMock.mockReset();
    revalidatePathMock.mockReset();

    authAssertMock.mockResolvedValue({ id: "user-1" });
    singleMock.mockResolvedValue({
      data: { id: "customer-1", company_name: "City of Edmond" },
      error: null,
    });
    selectMock.mockReturnValue({ single: singleMock });
    insertMock.mockReturnValue({ select: selectMock });
    fromMock.mockImplementation((table: string) => {
      if (table === "customers") return { insert: insertMock };
      throw new Error(`Unexpected table mock: ${table}`);
    });
  });

  it("rejects an empty company name before touching Supabase", async () => {
    const result = await createCustomer({ company_name: "   " });

    expect(result).toEqual({
      ok: false,
      error: "Company name is required",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    authAssertMock.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "You must be signed in.")
    );

    const result = await createCustomer({ company_name: "City of Edmond" });

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to add a customer.",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("creates the customer, nulls empty optional fields, and revalidates", async () => {
    const result = await createCustomer({
      company_name: "  City of Edmond  ",
      address_line1: "100 Main St",
      city: "",
    });

    expect(result).toEqual({
      ok: true,
      customer: { id: "customer-1", company_name: "City of Edmond" },
    });
    expect(insertMock).toHaveBeenCalledWith({
      company_name: "City of Edmond",
      address_line1: "100 Main St",
      address_line2: null,
      city: null,
      state: null,
      zip: null,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/customers");
  });

  it("surfaces database errors as a result object", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "duplicate key value" },
    });

    const result = await createCustomer({ company_name: "City of Edmond" });

    expect(result).toEqual({ ok: false, error: "duplicate key value" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
