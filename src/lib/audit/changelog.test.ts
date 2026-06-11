/**
 * Audit-log invariants — critical path tests
 * SA-QA-02: Mitigates risk of changelog entries being silently dropped,
 * duplicated, or written with a wrong author. Migration 006 fixed the
 * author-forgery vulnerability — these tests guard that fix at the unit level.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authAssertMock,
  getUserMock,
  fromMock,
  changeLogInsertMock,
  proposalSelectEqSingleMock,
  proposalDeleteEqMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  authAssertMock: vi.fn(),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  changeLogInsertMock: vi.fn(),
  proposalSelectEqSingleMock: vi.fn(),
  proposalDeleteEqMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
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
    // Mirror the real helpers but drive them from the same mocks so
    // existing resolve/reject setups keep working.
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

import { deleteProposal } from "@/app/(app)/proposals/[id]/actions";
import { buildDeleteConfirmationPhrase } from "@/lib/proposals/delete-confirmation";

const PROPOSAL_ID = "p-audit-1";
const PROPOSAL_NAME = "Audit Test Proposal";
const USER_ID = "user-1";
const USER_EMAIL = "user@example.com";

function setupHappyPathMocks() {
  authAssertMock.mockResolvedValue({ id: USER_ID });
  getUserMock.mockResolvedValue({
    data: { user: { id: USER_ID, email: USER_EMAIL } },
    error: null,
  });

  proposalSelectEqSingleMock.mockResolvedValue({
    data: {
      id: PROPOSAL_ID,
      name: PROPOSAL_NAME,
      status: "Draft",
      created_by: USER_ID,
    },
    error: null,
  });

  changeLogInsertMock.mockResolvedValue({ error: null });
  proposalDeleteEqMock.mockResolvedValue({ error: null, count: 1 });

  fromMock.mockImplementation((table: string) => {
    if (table === "change_log") {
      return { insert: changeLogInsertMock };
    }
    if (table === "proposals") {
      return {
        select: () => ({
          eq: () => ({ single: proposalSelectEqSingleMock }),
        }),
        delete: () => ({ eq: proposalDeleteEqMock }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("change_log payload invariants (SA-QA-02)", () => {
  beforeEach(() => {
    authAssertMock.mockReset();
    getUserMock.mockReset();
    fromMock.mockReset();
    changeLogInsertMock.mockReset();
    proposalSelectEqSingleMock.mockReset();
    proposalDeleteEqMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("writes a non-null author (changed_by) on the audit row", async () => {
    setupHappyPathMocks();

    const result = await deleteProposal(
      PROPOSAL_ID,
      "Cleaning up test data",
      buildDeleteConfirmationPhrase(PROPOSAL_NAME)
    );

    expect(result).toEqual({ ok: true });
    expect(changeLogInsertMock).toHaveBeenCalledTimes(1);
    const payload = changeLogInsertMock.mock.calls[0][0];
    expect(payload.changed_by).toBe(USER_ID);
    expect(payload.changed_by).not.toBeNull();
    expect(payload.changed_by).not.toBeUndefined();
  });

  it("populates non-null entity identifiers (table_name, record_id, proposal_id)", async () => {
    setupHappyPathMocks();
    await deleteProposal(
      PROPOSAL_ID,
      "Cleaning up",
      buildDeleteConfirmationPhrase(PROPOSAL_NAME)
    );

    const payload = changeLogInsertMock.mock.calls[0][0];
    expect(payload.table_name).toBe("proposals");
    expect(payload.record_id).toBe(PROPOSAL_ID);
    expect(payload.proposal_id).toBe(PROPOSAL_ID);
  });

  it("uses an allowed action enum value (DELETE)", async () => {
    setupHappyPathMocks();
    await deleteProposal(
      PROPOSAL_ID,
      "Cleaning up",
      buildDeleteConfirmationPhrase(PROPOSAL_NAME)
    );

    const payload = changeLogInsertMock.mock.calls[0][0];
    expect(["INSERT", "UPDATE", "DELETE"]).toContain(payload.action);
    expect(payload.action).toBe("DELETE");
  });

  it("captures a snapshot of the deleted row in old_values (name + status)", async () => {
    setupHappyPathMocks();
    await deleteProposal(
      PROPOSAL_ID,
      "Cleaning up",
      buildDeleteConfirmationPhrase(PROPOSAL_NAME)
    );

    const payload = changeLogInsertMock.mock.calls[0][0];
    expect(payload.old_values).toEqual({
      name: PROPOSAL_NAME,
      status: "Draft",
    });
  });

  it("records justification + deleter email in new_values", async () => {
    setupHappyPathMocks();
    await deleteProposal(
      PROPOSAL_ID,
      "  Trimmed reason  ",
      buildDeleteConfirmationPhrase(PROPOSAL_NAME)
    );

    const payload = changeLogInsertMock.mock.calls[0][0];
    expect(payload.new_values.justification).toBe("Trimmed reason");
    expect(payload.new_values.deleted_by_email).toBe(USER_EMAIL);
  });

  it("aborts the delete (fails closed) when the audit insert fails — no orphaned data", async () => {
    setupHappyPathMocks();
    changeLogInsertMock.mockResolvedValue({
      error: { message: "audit log unavailable" },
    });

    const result = await deleteProposal(
      PROPOSAL_ID,
      "Cleaning up",
      buildDeleteConfirmationPhrase(PROPOSAL_NAME)
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Audit log failed/);
    }
    // Critical invariant: if the audit row can't be written, the row
    // must NOT be deleted. This guards against silent data loss.
    expect(proposalDeleteEqMock).not.toHaveBeenCalled();
  });

  it("does NOT write an audit row when the typed-confirmation does not match", async () => {
    setupHappyPathMocks();

    const result = await deleteProposal(
      PROPOSAL_ID,
      "Cleaning up",
      "wrong text"
    );

    expect(result.ok).toBe(false);
    expect(changeLogInsertMock).not.toHaveBeenCalled();
    expect(proposalDeleteEqMock).not.toHaveBeenCalled();
  });

  it("does NOT write an audit row when the caller is unauthenticated", async () => {
    setupHappyPathMocks();
    const { AuthError } = await import("@/lib/auth/require-admin");
    authAssertMock.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "You must be signed in.")
    );

    const result = await deleteProposal(
      PROPOSAL_ID,
      "Cleaning up",
      buildDeleteConfirmationPhrase(PROPOSAL_NAME)
    );

    expect(result.ok).toBe(false);
    expect(changeLogInsertMock).not.toHaveBeenCalled();
  });

  it("audit row is written BEFORE the delete (preserves FK while writing snapshot)", async () => {
    setupHappyPathMocks();
    const callOrder: string[] = [];
    changeLogInsertMock.mockImplementation(async () => {
      callOrder.push("insert_change_log");
      return { error: null };
    });
    proposalDeleteEqMock.mockImplementation(async () => {
      callOrder.push("delete_proposal");
      return { error: null, count: 1 };
    });

    await deleteProposal(
      PROPOSAL_ID,
      "Cleaning up",
      buildDeleteConfirmationPhrase(PROPOSAL_NAME)
    );

    expect(callOrder).toEqual(["insert_change_log", "delete_proposal"]);
  });
});

// Most of the audit-log integrity is enforced by Postgres triggers and
// RLS policies (migration 006). These cannot be unit-tested without a
// live DB; they are tracked here so the gap is visible.
describe("trigger-enforced changelog invariants (DB-level)", () => {
  it.todo(
    "SA-QA-02: BEFORE INSERT trigger overwrites changed_by with auth.uid() — needs Supabase test helper integration"
  );
  it.todo(
    "SA-QA-02: customer INSERT/UPDATE/DELETE auto-logs to change_log — needs Supabase test helper integration"
  );
  it.todo(
    "SA-QA-02: customer UPDATE skips no-op writes — needs Supabase test helper integration"
  );
  it.todo(
    "SA-QA-02: change_log timestamp is a valid ISO string set by DB default — needs Supabase test helper integration"
  );
  it.todo(
    "SA-QA-02: RLS rejects INSERT where changed_by != auth.uid() — needs Supabase test helper integration"
  );
});
