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

import { updateProposalStatus } from "./actions";

describe("updateProposalStatus", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    rpcMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects invalid statuses before calling Supabase", async () => {
    const result = await updateProposalStatus("proposal-1", "Definitely Not Real");

    expect(result).toEqual({
      ok: false,
      error: "Invalid status: Definitely Not Real",
    });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const result = await updateProposalStatus("proposal-1", "Won");

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to change status.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls the atomic database transition and revalidates on success", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: true,
      error: null,
    });

    const result = await updateProposalStatus("proposal-1", "Won");

    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith("transition_proposal_status", {
      p_proposal_id: "proposal-1",
      p_new_status: "Won",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals/proposal-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
  });

  it("treats no-op transitions as success without revalidating", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: false,
      error: null,
    });

    const result = await updateProposalStatus("proposal-1", "Draft");

    expect(result).toEqual({ ok: true });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("surfaces database errors cleanly", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: "Proposal not found or you do not have permission to edit it.",
      },
    });

    const result = await updateProposalStatus("proposal-1", "Won");

    expect(result).toEqual({
      ok: false,
      error: "Proposal not found or you do not have permission to edit it.",
    });
  });
});
