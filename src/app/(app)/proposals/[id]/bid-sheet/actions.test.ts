import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authAssertMock,
  bidSheetEqMock,
  bidSheetMaybeSingleMock,
  bidSheetSelectMock,
  bidSheetUpdateEqMock,
  bidSheetUpdateMock,
  customerEqMock,
  customerMaybeSingleMock,
  customerSelectMock,
  fromMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  authAssertMock: vi.fn(),
  bidSheetEqMock: vi.fn(),
  bidSheetMaybeSingleMock: vi.fn(),
  bidSheetSelectMock: vi.fn(),
  bidSheetUpdateEqMock: vi.fn(),
  bidSheetUpdateMock: vi.fn(),
  customerEqMock: vi.fn(),
  customerMaybeSingleMock: vi.fn(),
  customerSelectMock: vi.fn(),
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
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { AuthError } from "@/lib/auth/require-admin";
import {
  updateBidSheetCredit,
  updateBidSheetCustomer,
  updateBidSheetDiscountPercent,
  updateBidSheetNotes,
} from "./actions";

describe("bid sheet actions", () => {
  const proposalId = "11111111-1111-4111-8111-111111111111";
  const customerId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    authAssertMock.mockReset();
    bidSheetEqMock.mockReset();
    bidSheetMaybeSingleMock.mockReset();
    bidSheetSelectMock.mockReset();
    bidSheetUpdateEqMock.mockReset();
    bidSheetUpdateMock.mockReset();
    customerEqMock.mockReset();
    customerMaybeSingleMock.mockReset();
    customerSelectMock.mockReset();
    fromMock.mockReset();
    revalidatePathMock.mockReset();

    authAssertMock.mockResolvedValue({ id: "user-1" });

    bidSheetEqMock.mockReturnValue({
      maybeSingle: bidSheetMaybeSingleMock,
    });
    bidSheetSelectMock.mockReturnValue({
      eq: bidSheetEqMock,
    });
    bidSheetMaybeSingleMock.mockResolvedValue({
      data: {
        id: "bid-sheet-1",
        proposal_id: proposalId,
      },
      error: null,
    });
    bidSheetUpdateEqMock.mockResolvedValue({
      error: null,
    });
    bidSheetUpdateMock.mockReturnValue({
      eq: bidSheetUpdateEqMock,
    });

    customerEqMock.mockReturnValue({
      maybeSingle: customerMaybeSingleMock,
    });
    customerSelectMock.mockReturnValue({
      eq: customerEqMock,
    });
    customerMaybeSingleMock.mockResolvedValue({
      data: { id: customerId },
      error: null,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "bid_sheets") {
        return {
          select: bidSheetSelectMock,
          update: bidSheetUpdateMock,
        };
      }
      if (table === "customers") {
        return {
          select: customerSelectMock,
        };
      }
      throw new Error(`Unexpected table mock: ${table}`);
    });
  });

  it("rejects unauthenticated callers for customer updates", async () => {
    authAssertMock.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "You must be signed in.")
    );

    const result = await updateBidSheetCustomer(proposalId, customerId);

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to update the bid sheet customer.",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("updates the customer after validating the selected customer exists", async () => {
    const result = await updateBidSheetCustomer(proposalId, customerId);

    expect(result).toEqual({ ok: true });
    expect(customerEqMock).toHaveBeenCalledWith("id", customerId);
    expect(bidSheetUpdateMock).toHaveBeenCalledWith({ customer_id: customerId });
    expect(bidSheetUpdateEqMock).toHaveBeenCalledWith("id", "bid-sheet-1");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/proposals/${proposalId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/proposals/${proposalId}/bid-sheet`
    );
  });

  it("rejects invalid discount percent before calling Supabase", async () => {
    const result = await updateBidSheetDiscountPercent(proposalId, 250);

    expect(result).toEqual({
      ok: false,
      error: "Discount % cannot exceed 100",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("updates discount percent and credit through the bid sheet row", async () => {
    const discountPercentResult = await updateBidSheetDiscountPercent(
      proposalId,
      12.5
    );
    const creditResult = await updateBidSheetCredit(proposalId, 1500);

    expect(discountPercentResult).toEqual({ ok: true });
    expect(creditResult).toEqual({ ok: true });
    expect(bidSheetUpdateMock).toHaveBeenCalledWith({ discount_percent: 12.5 });
    expect(bidSheetUpdateMock).toHaveBeenCalledWith({ discount_dollars: 1500 });
  });

  it("surfaces missing bid sheet rows cleanly", async () => {
    bidSheetMaybeSingleMock.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await updateBidSheetNotes(proposalId, "hello");

    expect(result).toEqual({
      ok: false,
      error: "Bid Sheet Unavailable. This proposal is missing its bid sheet row.",
    });
    expect(bidSheetUpdateMock).not.toHaveBeenCalled();
  });

  it("updates notes and revalidates on success", async () => {
    const result = await updateBidSheetNotes(proposalId, "Important note");

    expect(result).toEqual({ ok: true });
    expect(bidSheetUpdateMock).toHaveBeenCalledWith({
      notes: "Important note",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/proposals/${proposalId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/proposals/${proposalId}/bid-sheet`
    );
  });
});
