/**
 * Lifecycle state machine — critical path tests
 * SA-QA-02: Mitigates risk of invalid status transitions reaching the DB.
 * The transition rules are enforced in the transitionproposalstatus RPC
 * (migration 016) but the JS layer that calls it should reject illegal
 * transitions before the round-trip.
 *
 * These tests cover the pure-function / validation layer only (no DB calls).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROPOSAL_STATUSES,
  type ProposalStatus,
} from "@/lib/constants/statuses";

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

import { updateProposalStatus } from "./[id]/actions";

function authedUser() {
  getUserMock.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
}

describe("proposal lifecycle — JS-layer status validation", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    rpcMock.mockReset();
    revalidatePathMock.mockReset();
  });

  describe("status enum guard (pre-RPC)", () => {
    it("rejects an unknown status without calling the RPC", async () => {
      authedUser();
      const result = await updateProposalStatus("p-1", "Bogus");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/Invalid status/);
      }
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("rejects an empty status string", async () => {
      authedUser();
      const result = await updateProposalStatus("p-1", "");
      expect(result.ok).toBe(false);
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("is case-sensitive — 'won' (lowercase) is not valid", async () => {
      authedUser();
      const result = await updateProposalStatus("p-1", "won");
      expect(result.ok).toBe(false);
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it.each(PROPOSAL_STATUSES.map((s) => [s]))(
      "accepts the canonical status %s and calls the RPC",
      async (status: ProposalStatus) => {
        authedUser();
        rpcMock.mockResolvedValue({ data: true, error: null });

        const result = await updateProposalStatus("p-1", status);

        expect(result).toEqual({ ok: true });
        expect(rpcMock).toHaveBeenCalledWith("transition_proposal_status", {
          p_proposal_id: "p-1",
          p_new_status: status,
        });
      }
    );
  });

  describe("auth gate (second layer of defense)", () => {
    it("rejects an unauthenticated caller before invoking the RPC", async () => {
      getUserMock.mockResolvedValue({ data: { user: null }, error: null });

      const result = await updateProposalStatus("p-1", "Won");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/signed in/i);
      }
      expect(rpcMock).not.toHaveBeenCalled();
    });
  });

  describe("typed result discrimination", () => {
    it("returns ok:true with no extra fields on success", async () => {
      authedUser();
      rpcMock.mockResolvedValue({ data: true, error: null });

      const result = await updateProposalStatus("p-1", "Won");
      expect(result).toEqual({ ok: true });
    });

    it("returns ok:false with an error message when the RPC errors", async () => {
      authedUser();
      rpcMock.mockResolvedValue({
        data: null,
        error: { message: "transition not allowed: Lost -> Draft" },
      });

      const result = await updateProposalStatus("p-1", "Draft");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("transition not allowed");
      }
    });

    it("treats RPC returning false (no-op) as success without revalidating paths", async () => {
      authedUser();
      rpcMock.mockResolvedValue({ data: false, error: null });

      const result = await updateProposalStatus("p-1", "Won");

      expect(result).toEqual({ ok: true });
      // The action only revalidates when the RPC reports a real change.
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("revalidates the proposal and list paths after a successful change", async () => {
      authedUser();
      rpcMock.mockResolvedValue({ data: true, error: null });

      await updateProposalStatus("p-42", "Won");

      expect(revalidatePathMock).toHaveBeenCalledWith("/proposals/p-42");
      expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
    });
  });

  // The actual transition rule table (which "from -> to" pairs are
  // legal — e.g. closed/Lost cannot return to Draft) lives entirely in
  // the transition_proposal_status Postgres RPC (migration 016). The
  // JS layer only enforces the enum allow-list above; we cannot
  // exercise the rule table here without a live DB.
  describe("transition rule table (RPC-enforced)", () => {
    it.todo(
      "SA-QA-02: rejects Lost -> Draft (RPC rule) — needs Supabase test helper integration"
    );
    it.todo(
      "SA-QA-02: rejects Won -> Draft (RPC rule) — needs Supabase test helper integration"
    );
    it.todo(
      "SA-QA-02: allows Draft -> Proposal Sent (RPC rule) — needs Supabase test helper integration"
    );
    it.todo(
      "SA-QA-02: allows VOID from any non-terminal status (RPC rule) — needs Supabase test helper integration"
    );
  });
});
