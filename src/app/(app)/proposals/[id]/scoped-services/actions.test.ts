import { beforeEach, describe, expect, it, vi } from "vitest";

const { authAssertMock, revalidatePathMock, rpcMock, scopedServicesSelectMock } =
  vi.hoisted(() => ({
    authAssertMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    rpcMock: vi.fn(),
    scopedServicesSelectMock: vi.fn(),
  }));

type ProposalRow = { id: string };
type ScopedServiceRow = {
  id: string;
  proposal_id: string;
  service_type: string;
  description: string | null;
  hours: number;
  rate_card_lookup_key: string;
  cost: number;
  row_order: number;
};
type RateCardRow = {
  lookup_key: string;
  rate: number;
  activity: string;
  role_category: string;
  status: string;
};
type DeleteScopedServiceLineArgs = {
  p_proposal_id: string;
  p_line_id: string;
};
type WriteOptions = { count?: "exact" | "planned" | "estimated" };
type CountedWriteResult = { error: { message: string } | null; count: number | null };

let proposalRows: ProposalRow[] = [];
let scopedServiceRows: ScopedServiceRow[] = [];
let rateCardRows: RateCardRow[] = [];
// Mirrors RLS on scoped_services: when false (caller is not the proposal
// owner or an admin) updates and deletes match zero rows and return no error.
let scopedServicesWritable = true;
// One-shot override for the bulk Clear Tab delete result.
let clearDeleteResultOverride: CountedWriteResult | null = null;
// One-shot side effect run with that override (e.g. another session's delete).
let clearDeleteSideEffect: (() => void) | null = null;

// Supabase only fills `count` when the write asked for { count: "exact" }.
function countedResult(
  options: WriteOptions | undefined,
  affected: number
): CountedWriteResult {
  return { error: null, count: options?.count === "exact" ? affected : null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc(name: string, args: DeleteScopedServiceLineArgs) {
      return rpcMock(name, args);
    },
    from(table: string) {
      if (table === "proposals") {
        return {
          select() {
            return {
              eq(_column: string, value: string) {
                return {
                  async maybeSingle() {
                    const data =
                      proposalRows.find((proposal) => proposal.id === value) ?? null;
                    return { data, error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "rate_cards") {
        return {
          select() {
            return {
              eq(_column: string, value: string) {
                return {
                  order() {
                    const data = rateCardRows
                      .filter((row) => row.status === value)
                      .sort((a, b) => a.lookup_key.localeCompare(b.lookup_key))
                      .map(({ lookup_key, rate, activity, role_category }) => ({
                        lookup_key,
                        rate,
                        activity,
                        role_category,
                      }));
                    return Promise.resolve({ data, error: null });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "scoped_services") {
        return {
          select() {
            scopedServicesSelectMock();
            return {
              eq(_column: string, value: string) {
                return Promise.resolve({
                  data: scopedServiceRows
                    .filter((row) => row.proposal_id === value)
                    .map(
                      ({
                        id,
                        service_type,
                        description,
                        hours,
                        rate_card_lookup_key,
                        cost,
                        row_order,
                      }) => ({
                        id,
                        service_type,
                        description,
                        hours,
                        rate_card_lookup_key,
                        cost,
                        row_order,
                      })
                    ),
                  error: null,
                });
              },
            };
          },
          insert(payload: Partial<ScopedServiceRow>) {
            if (!scopedServicesWritable) {
              // RLS refuses inserts with an error, unlike updates/deletes.
              return Promise.resolve({
                error: {
                  code: "42501",
                  message:
                    'new row violates row-level security policy for table "scoped_services"',
                },
              });
            }
            scopedServiceRows.push({
              id: `line-${scopedServiceRows.length + 1}`,
              proposal_id: String(payload.proposal_id),
              service_type: String(payload.service_type),
              description: payload.description ?? null,
              hours: Number(payload.hours ?? 0),
              rate_card_lookup_key: String(payload.rate_card_lookup_key),
              cost: Number(payload.cost ?? 0),
              row_order: Number(payload.row_order ?? scopedServiceRows.length),
            });
            return Promise.resolve({ error: null });
          },
          update(payload: Partial<ScopedServiceRow>, options?: WriteOptions) {
            return {
              eq(column: string, value: string) {
                if (column !== "id") {
                  throw new Error(`Unexpected update eq column ${column}`);
                }
                return {
                  async eq(secondColumn: string, secondValue: string) {
                    if (secondColumn !== "proposal_id") {
                      throw new Error(
                        `Unexpected update eq second column ${secondColumn}`
                      );
                    }
                    if (!scopedServicesWritable) {
                      return countedResult(options, 0);
                    }
                    let affected = 0;
                    scopedServiceRows = scopedServiceRows.map((row) => {
                      if (row.id === value && row.proposal_id === secondValue) {
                        affected += 1;
                        return { ...row, ...payload };
                      }
                      return row;
                    });
                    return countedResult(options, affected);
                  },
                };
              },
            };
          },
          delete(options?: WriteOptions) {
            return {
              eq(column: string, value: string) {
                // Bulk clear path: delete().eq("proposal_id", id) resolves
                // directly; per-line path chains a second eq for proposal_id.
                if (column === "proposal_id") {
                  let result: CountedWriteResult;
                  if (clearDeleteResultOverride) {
                    result = clearDeleteResultOverride;
                    clearDeleteResultOverride = null;
                    clearDeleteSideEffect?.();
                    clearDeleteSideEffect = null;
                  } else if (!scopedServicesWritable) {
                    result = countedResult(options, 0);
                  } else {
                    const before = scopedServiceRows.length;
                    scopedServiceRows = scopedServiceRows.filter(
                      (row) => row.proposal_id !== value
                    );
                    result = countedResult(
                      options,
                      before - scopedServiceRows.length
                    );
                  }
                  return {
                    then(resolve: (result: CountedWriteResult) => void) {
                      resolve(result);
                    },
                  };
                }
                if (column !== "id") {
                  throw new Error(`Unexpected delete eq column ${column}`);
                }
                return {
                  async eq(secondColumn: string, secondValue: string) {
                    if (secondColumn !== "proposal_id") {
                      throw new Error(
                        `Unexpected delete eq second column ${secondColumn}`
                      );
                    }
                    if (!scopedServicesWritable) {
                      return countedResult(options, 0);
                    }
                    const before = scopedServiceRows.length;
                    scopedServiceRows = scopedServiceRows.filter(
                      (row) => !(row.id === value && row.proposal_id === secondValue)
                    );
                    return countedResult(options, before - scopedServiceRows.length);
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table mock: ${table}`);
    },
  })),
}));

vi.mock("@/lib/auth/require-admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-admin")>(
    "@/lib/auth/require-admin"
  );

  return {
    ...actual,
    assertAuthenticated: authAssertMock,
    // Mirror the real helper but drive it from the same mock so existing
    // resolve/reject setups keep working.
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
import { PROPOSAL_EDIT_NOT_PERMITTED } from "@/lib/supabase/affected-rows";
import {
  addScopedServiceLine,
  clearScopedServices,
  deleteScopedServiceLine,
  updateScopedServiceLine,
} from "./actions";

describe("scoped services actions", () => {
  const proposalId = "11111111-1111-4111-8111-111111111111";
  const otherProposalId = "99999999-9999-4999-8999-999999999999";
  const lineOneId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const lineTwoId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const lineThreeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  beforeEach(() => {
    authAssertMock.mockReset();
    revalidatePathMock.mockReset();
    rpcMock.mockReset();
    scopedServicesSelectMock.mockReset();
    scopedServicesWritable = true;
    clearDeleteResultOverride = null;
    clearDeleteSideEffect = null;

    authAssertMock.mockResolvedValue({ id: "user-1" });
    rpcMock.mockImplementation(
      async (name: string, args: DeleteScopedServiceLineArgs) => {
        if (name !== "delete_scoped_service_line") {
          throw new Error(`Unexpected rpc call ${name}`);
        }

        const lineIndex = scopedServiceRows.findIndex(
          (row) =>
            row.id === args.p_line_id && row.proposal_id === args.p_proposal_id
        );

        if (lineIndex === -1) {
          return {
            data: null,
            error: {
              message: `Scoped service line ${args.p_line_id} was not found for proposal ${args.p_proposal_id}`,
            },
          };
        }

        scopedServiceRows = scopedServiceRows.filter(
          (row) =>
            !(row.id === args.p_line_id && row.proposal_id === args.p_proposal_id)
        );

        const resequenced = scopedServiceRows
          .filter((row) => row.proposal_id === args.p_proposal_id)
          .sort((a, b) => {
            if (a.row_order !== b.row_order) return a.row_order - b.row_order;
            return a.id.localeCompare(b.id);
          });

        scopedServiceRows = scopedServiceRows.map((row) => {
          const nextRowOrder = resequenced.findIndex(
            (orderedRow) => orderedRow.id === row.id
          );

          return nextRowOrder === -1
            ? row
            : { ...row, row_order: nextRowOrder };
        });

        return { data: null, error: null };
      }
    );

    proposalRows = [{ id: proposalId }];
    rateCardRows = [
      {
        lookup_key: "Master|Program Manager",
        rate: 250,
        activity: "Program Manager",
        role_category: "PM",
        status: "Active",
      },
      {
        lookup_key: "Master|Sr. Implementation Manager",
        rate: 300,
        activity: "Sr. Implementation Manager",
        role_category: "Sr IM",
        status: "Active",
      },
    ];
    scopedServiceRows = [
      {
        id: lineOneId,
        proposal_id: proposalId,
        service_type: "01 Data Fix",
        description: "Existing",
        hours: 2,
        rate_card_lookup_key: "Master|Sr. Implementation Manager",
        cost: 600,
        row_order: 0,
      },
      {
        id: lineTwoId,
        proposal_id: proposalId,
        service_type: "02 Mail Merge",
        description: "Second",
        hours: 1,
        rate_card_lookup_key: "Master|Program Manager",
        cost: 250,
        row_order: 2,
      },
      {
        id: lineThreeId,
        proposal_id: otherProposalId,
        service_type: "05 Other",
        description: "Other proposal",
        hours: 9,
        rate_card_lookup_key: "Master|Program Manager",
        cost: 2250,
        row_order: 0,
      },
    ];
  });

  it("rejects unauthenticated callers for adds", async () => {
    authAssertMock.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "You must be signed in.")
    );

    const result = await addScopedServiceLine(proposalId);

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to add scoped service lines.",
    });
  });

  it("reports a refused add with the shared permission message", async () => {
    scopedServicesWritable = false;

    const result = await addScopedServiceLine(proposalId);

    expect(result).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
    expect(
      scopedServiceRows.filter((row) => row.proposal_id === proposalId)
    ).toHaveLength(2);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("adds a line at the next row order and returns canonical rows", async () => {
    const result = await addScopedServiceLine(proposalId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toHaveLength(3);
    expect(result.lines[2]).toMatchObject({
      service_type: "01 Data Fix",
      description: "",
      hours: 0,
      cost: 0,
      row_order: 3,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/proposals/${proposalId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/proposals/${proposalId}/scoped-services`
    );
  });

  it("recomputes cost from the server-side rate card on update", async () => {
    const result = await updateScopedServiceLine(proposalId, lineOneId, {
      serviceType: "05 Other",
      description: "Updated",
      hours: 4,
      rateCardLookupKey: "Master|Program Manager",
    });

    expect(result).toEqual({
      ok: true,
      lines: expect.arrayContaining([
        expect.objectContaining({
          id: lineOneId,
          service_type: "05 Other",
          description: "Updated",
          hours: 4,
          rate_card_lookup_key: "Master|Program Manager",
          cost: 1000,
        }),
      ]),
    });
  });

  it("rounds the persisted scoped cost to the cent", async () => {
    // Contrived sub-cent rate to exercise rounding at the persistence edge.
    rateCardRows.push({
      lookup_key: "Master|Business Analyst",
      rate: 200.555,
      activity: "Business Analyst",
      role_category: "BA",
      status: "Active",
    });

    const result = await updateScopedServiceLine(proposalId, lineOneId, {
      serviceType: "05 Other",
      description: "Rounded",
      hours: 1,
      rateCardLookupKey: "Master|Business Analyst",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.find((line) => line.id === lineOneId)?.cost).toBe(
      200.56
    );
  });

  it("reports a line update that RLS refused instead of reloading rows", async () => {
    // A non-owner's update affects zero rows and returns no error.
    scopedServicesWritable = false;
    const before = structuredClone(scopedServiceRows);

    const result = await updateScopedServiceLine(proposalId, lineOneId, {
      serviceType: "05 Other",
      description: "Not mine",
      hours: 4,
      rateCardLookupKey: "Master|Program Manager",
    });

    expect(result).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
    expect(scopedServiceRows).toEqual(before);
    // Only the pre-update existence check read the rows; no canonical reload.
    expect(scopedServicesSelectMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects deletes for lines outside the proposal", async () => {
    const result = await deleteScopedServiceLine(proposalId, lineThreeId);

    expect(result).toEqual({
      ok: false,
      error: "Scoped service line not found for this proposal.",
    });
    expect(rpcMock).toHaveBeenCalledWith("delete_scoped_service_line", {
      p_proposal_id: proposalId,
      p_line_id: lineThreeId,
    });
  });

  it("reports a refused delete as not permitted while the line is still there", async () => {
    // What RLS does to a non-owner: the RPC's DELETE matches no row, so it
    // raises its "not found" error even though the line exists.
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: `Scoped service line ${lineOneId} was not found for proposal ${proposalId}`,
      },
    });

    const result = await deleteScopedServiceLine(proposalId, lineOneId);

    expect(result).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
    // Only the existence check read the rows; nothing was revalidated.
    expect(scopedServicesSelectMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(scopedServiceRows.find((row) => row.id === lineOneId)).toBeDefined();
  });

  it("does not reload or revalidate when the scoped-service RPC fails", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "connection reset" },
    });

    const result = await deleteScopedServiceLine(proposalId, lineOneId);

    expect(result).toEqual({ ok: false, error: "connection reset" });
    expect(scopedServicesSelectMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(scopedServiceRows.find((row) => row.id === lineOneId)).toBeDefined();
  });

  it("deletes and resequences row_order through the scoped-service RPC", async () => {
    const result = await deleteScopedServiceLine(proposalId, lineOneId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("delete_scoped_service_line", {
      p_proposal_id: proposalId,
      p_line_id: lineOneId,
    });
    expect(scopedServicesSelectMock).toHaveBeenCalledTimes(1);
    expect(result.lines).toEqual([
      expect.objectContaining({
        id: lineTwoId,
        row_order: 0,
      }),
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/proposals/${proposalId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/proposals/${proposalId}/scoped-services`
    );
  });

  it("clears every scoped service line for the proposal", async () => {
    const result = await clearScopedServices(proposalId);

    expect(result).toEqual({ ok: true, lines: [] });
    expect(scopedServiceRows.filter((r) => r.proposal_id === proposalId)).toEqual([]);
    expect(scopedServiceRows.map((r) => r.id)).toEqual([lineThreeId]);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/proposals/${proposalId}`);
  });

  it("reports a clear that RLS refused and keeps the rows", async () => {
    // A non-owner's delete affects zero rows and returns no error.
    scopedServicesWritable = false;

    const result = await clearScopedServices(proposalId);

    expect(result).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
    expect(
      scopedServiceRows.filter((r) => r.proposal_id === proposalId)
    ).toHaveLength(2);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports a short clear that left rows behind as not permitted", async () => {
    clearDeleteResultOverride = { error: null, count: 1 };

    const result = await clearScopedServices(proposalId);

    expect(result).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("treats a short clear as done when another session removed the other rows", async () => {
    // The read saw 2 rows; another session deleted one, so this delete
    // removed only 1, but nothing is left on the proposal.
    clearDeleteResultOverride = { error: null, count: 1 };
    clearDeleteSideEffect = () => {
      scopedServiceRows = scopedServiceRows.filter(
        (row) => row.proposal_id !== proposalId
      );
    };

    const result = await clearScopedServices(proposalId);

    expect(result).toEqual({ ok: true, lines: [] });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/proposals/${proposalId}`);
  });

  it("still clears an already-empty proposal (zero rows is legitimate)", async () => {
    scopedServiceRows = scopedServiceRows.filter(
      (row) => row.proposal_id !== proposalId
    );

    const result = await clearScopedServices(proposalId);

    expect(result).toEqual({ ok: true, lines: [] });
    expect(scopedServiceRows.map((r) => r.id)).toEqual([lineThreeId]);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/proposals/${proposalId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/proposals/${proposalId}/scoped-services`
    );
  });

  it("rejects unauthenticated clear requests", async () => {
    authAssertMock.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "You must be signed in.")
    );

    const result = await clearScopedServices(proposalId);

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to clear scoped services.",
    });
    expect(scopedServiceRows.length).toBeGreaterThan(0);
  });
});
