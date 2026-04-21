import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock, rpcMock, revalidatePathMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { createProposal } from "./actions";

describe("createProposal", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    rpcMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects invalid input before calling Supabase", async () => {
    const result = await createProposal({ name: "   ", customerId: "" });

    expect(result).toEqual({
      ok: false,
      error: "Proposal name is required",
    });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const result = await createProposal({ name: "Acme Rollout", customerId: "" });

    expect(result).toEqual({
      ok: false,
      error: "You must be logged in.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls the atomic bootstrap function and revalidates on success", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: "proposal-1",
      error: null,
    });

    const result = await createProposal({
      name: "Acme Rollout",
      customerId: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(result).toEqual({ ok: true, proposalId: "proposal-1" });
    expect(rpcMock).toHaveBeenCalledWith("create_proposal_bundle", {
      p_name: "Acme Rollout",
      p_customer_id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
  });

  it("surfaces bootstrap failures cleanly", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "duplicate key value violates unique constraint" },
    });

    const result = await createProposal({ name: "Acme Rollout", customerId: "" });

    expect(result).toEqual({
      ok: false,
      error: "duplicate key value violates unique constraint",
    });
  });
});
