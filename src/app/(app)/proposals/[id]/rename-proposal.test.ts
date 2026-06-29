import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock, fromMock, updateMock, eqMock, revalidatePathMock } =
  vi.hoisted(() => {
    const eq = vi.fn();
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    return {
      getUserMock: vi.fn(),
      fromMock: from,
      updateMock: update,
      eqMock: eq,
      revalidatePathMock: vi.fn(),
    };
  });

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { renameProposal } from "./actions";

const PROPOSAL_ID = "123e4567-e89b-12d3-a456-426614174000";

function authedUser() {
  getUserMock.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
}

describe("renameProposal", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockClear();
    updateMock.mockClear();
    eqMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects a blank name before touching Supabase", async () => {
    const result = await renameProposal(PROPOSAL_ID, "   ");

    expect(result).toEqual({ ok: false, error: "Proposal name is required" });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a name longer than 200 characters", async () => {
    const result = await renameProposal(PROPOSAL_ID, "a".repeat(201));

    expect(result).toEqual({
      ok: false,
      error: "Proposal name cannot exceed 200 characters",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });

    const result = await renameProposal(PROPOSAL_ID, "New name");

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to rename a proposal.",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns a permission error when RLS blocks the update (zero rows)", async () => {
    authedUser();
    eqMock.mockResolvedValue({ error: null, count: 0 });

    const result = await renameProposal(PROPOSAL_ID, "New name");

    expect(result).toEqual({
      ok: false,
      error: "Proposal not found or you do not have permission to rename it.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("trims and persists the new name, then revalidates", async () => {
    authedUser();
    eqMock.mockResolvedValue({ error: null, count: 1 });

    const result = await renameProposal(PROPOSAL_ID, "  Acme Rollout v2  ");

    expect(result).toEqual({ ok: true, name: "Acme Rollout v2" });
    expect(updateMock).toHaveBeenCalledWith(
      { name: "Acme Rollout v2" },
      { count: "exact" }
    );
    expect(eqMock).toHaveBeenCalledWith("id", PROPOSAL_ID);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/proposals/${PROPOSAL_ID}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
  });

  it("surfaces a Supabase error message cleanly", async () => {
    authedUser();
    eqMock.mockResolvedValue({
      error: { message: "update failed" },
      count: null,
    });

    const result = await renameProposal(PROPOSAL_ID, "New name");

    expect(result).toEqual({ ok: false, error: "update failed" });
  });
});
