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

import { createProposal } from "./new/actions";
import { updateProposalStatus } from "./[id]/actions";

describe("proposal lifecycle actions", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    rpcMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("maps the create and status RPC contracts correctly for the same proposal flow", async () => {
    getUserMock
      .mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
        error: null,
      });

    rpcMock
      .mockResolvedValueOnce({
        data: "proposal-123",
        error: null,
      })
      .mockResolvedValueOnce({
        data: true,
        error: null,
      });

    const createResult = await createProposal({
      name: "Revenue Flow",
      customerId: "",
    });
    const statusResult = await updateProposalStatus("proposal-123", "Won");

    expect(createResult).toEqual({ ok: true, proposalId: "proposal-123" });
    expect(statusResult).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenNthCalledWith(1, "create_proposal_bundle", {
      p_name: "Revenue Flow",
      p_customer_id: null,
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, "transition_proposal_status", {
      p_proposal_id: "proposal-123",
      p_new_status: "Won",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals/proposal-123");
  });
});
