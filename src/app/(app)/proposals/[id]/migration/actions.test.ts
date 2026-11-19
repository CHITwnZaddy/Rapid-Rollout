import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authAssertMock,
  computeTotalsMock,
  fetchRequiredRatesMock,
  fromMock,
  rpcMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  authAssertMock: vi.fn(),
  computeTotalsMock: vi.fn(),
  fetchRequiredRatesMock: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: fromMock,
    rpc: rpcMock,
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

vi.mock("@/lib/supabase/queries", () => ({
  fetchRequiredRates: fetchRequiredRatesMock,
}));

vi.mock("@/lib/migration/compute-totals-from-state", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/migration/compute-totals-from-state")>(
      "@/lib/migration/compute-totals-from-state"
    );

  return {
    ...actual,
    computeMigrationTotalsFromState: computeTotalsMock,
  };
});

import { AuthError } from "@/lib/auth/require-admin";
import { PROPOSAL_EDIT_NOT_PERMITTED } from "@/lib/supabase/affected-rows";
import {
  addMigrationDetailLine,
  removeMigrationDetailLine,
  resetMigrationServices,
} from "./actions";

type ConfigRow = {
  id: string;
  proposal_id: string;
  computed_total_cost: number;
  num_projects: number;
  hrs_per_import: number;
  lines_per_import_file: number;
  is_effort_included: boolean;
  is_workshop_included: boolean;
    complexity_factor: number;
    sr_im_trips: number;
  pm_trips: number;
  doc_avg_mb_per_project: number;
  doc_mb_per_hour: number;
  core_requirements_hrs: number;
  core_migration_plan_hrs: number;
  core_validation_hrs: number;
  core_final_qa_hrs: number;
  core_pm_oversight_hrs: number;
};

type LineRow = {
  id: string;
  proposal_id: string;
  section: "project" | "workflow" | "cost";
  label: string;
  quantity: number;
  items_per_object: number;
  total_line_items: number;
  row_order: number;
};

describe("migration actions", () => {
  const proposalId = "11111111-1111-4111-8111-111111111111";

  let configRow: ConfigRow | null;
  let lineRows: LineRow[];
  let configUpdates: Array<{ id: string; payload: Record<string, unknown> }>;
  let lineInserts: Array<Record<string, unknown>>;
  let lineUpdates: Array<{ id: string; payload: Record<string, unknown> }>;
  let lineDeletes: string[];
  // Tables whose UPDATE/DELETE RLS silently filters, as it does for a caller
  // who is not the proposal's owner or an admin: no error, zero rows.
  let refusedTables: Set<string>;

  // Supabase only fills `count` when the write asked for { count: "exact" }.
  const writeCount = (options: { count?: string } | undefined, rows: number) =>
    options?.count === "exact" ? rows : null;

  beforeEach(() => {
    configRow = {
      id: "cfg-1",
      proposal_id: proposalId,
      computed_total_cost: 0,
      num_projects: 3,
      hrs_per_import: 4,
      lines_per_import_file: 1000,
      is_effort_included: true,
      is_workshop_included: false,
            complexity_factor: 1.25,
      sr_im_trips: 0,
      pm_trips: 0,
      doc_avg_mb_per_project: 200,
      doc_mb_per_hour: 50,
      core_requirements_hrs: 8,
      core_migration_plan_hrs: 6,
      core_validation_hrs: 4,
      core_final_qa_hrs: 2,
      core_pm_oversight_hrs: 3,
    };

    lineRows = [
      {
        id: "22222222-2222-4222-8222-222222222221",
        proposal_id: proposalId,
        section: "project",
        label: "Project Info/Detail",
        quantity: 1,
        items_per_object: 500,
        total_line_items: 0,
        row_order: 0,
      },
      {
        id: "33333333-3333-4333-8333-333333333331",
        proposal_id: proposalId,
        section: "workflow",
        label: "Workflow Approval",
        quantity: 2,
        items_per_object: 300,
        total_line_items: 0,
        row_order: 0,
      },
      {
        id: "33333333-3333-4333-8333-333333333332",
        proposal_id: proposalId,
        section: "workflow",
        label: "Workflow Escalation",
        quantity: 4,
        items_per_object: 700,
        total_line_items: 0,
        row_order: 3,
      },
      {
        id: "44444444-4444-4444-8444-444444444441",
        proposal_id: proposalId,
        section: "cost",
        label: "Budgets",
        quantity: 1,
        items_per_object: 200,
        total_line_items: 0,
        row_order: 0,
      },
    ];

    configUpdates = [];
    lineInserts = [];
    lineUpdates = [];
    lineDeletes = [];
    refusedTables = new Set();

    authAssertMock.mockReset();
    computeTotalsMock.mockReset();
    fetchRequiredRatesMock.mockReset();
    fromMock.mockReset();
    rpcMock.mockReset();
    revalidatePathMock.mockReset();

    authAssertMock.mockResolvedValue({ id: "user-1" });
    fetchRequiredRatesMock.mockResolvedValue({
      ok: true,
      rates: new Map([
        ["Master|Sr. Implementation Manager", 100],
        ["Master|Program Manager", 150],
        ["Master|Travel Cost/Trip", 1000],
      ]),
    });
    computeTotalsMock.mockReturnValue({ clientPrice: 4321 });
    // Simulate delete_migration_detail_line: delete the row, then densely
    // resequence its section by (row_order, id) — mirrors the SQL RPC so the
    // action's reload reflects reality. Other RPCs resolve cleanly.
    rpcMock.mockImplementation(
      async (
        fnName: string,
        args?: { p_proposal_id?: string; p_line_id?: string }
      ) => {
        if (fnName !== "delete_migration_detail_line") {
          return { error: null };
        }
        const proposal = args?.p_proposal_id;
        const lineId = args?.p_line_id;
        const target = lineRows.find(
          (line) => line.id === lineId && line.proposal_id === proposal
        );
        if (!target) {
          return {
            error: {
              message: `Migration detail row ${lineId} was not found for proposal ${proposal}`,
            },
          };
        }
        // SECURITY INVOKER: the SELECT above sees the row, but RLS filters the
        // DELETE and resequence for a non-owner, so the RPC returns cleanly.
        if (refusedTables.has("migration_detail_lines")) {
          return { error: null };
        }
        const { section } = target;
        lineRows = lineRows.filter((line) => line.id !== lineId);
        const sectionLines = lineRows
          .filter(
            (line) => line.proposal_id === proposal && line.section === section
          )
          .sort(
            (a, b) => (a.row_order ?? 0) - (b.row_order ?? 0) || a.id.localeCompare(b.id)
          );
        const nextOrder = new Map(
          sectionLines.map((line, index) => [line.id, index])
        );
        lineRows = lineRows.map((line) =>
          nextOrder.has(line.id)
            ? { ...line, row_order: nextOrder.get(line.id) ?? line.row_order }
            : line
        );
        return { error: null };
      }
    );

    fromMock.mockImplementation((table: string) => {
      if (table === "migration_config") {
        return {
          select: () => ({
            eq: (_field: string, value: string) => ({
              maybeSingle: async () => ({
                data:
                  configRow && configRow.proposal_id === value ? configRow : null,
                error: null,
              }),
            }),
          }),
          update: (
            payload: Record<string, unknown>,
            options?: { count?: string }
          ) => ({
            eq: async (_field: string, id: string) => {
              configUpdates.push({ id, payload });
              if (!configRow || configRow.id !== id) {
                return { error: { message: "Config not found" }, count: null };
              }
              if (refusedTables.has("migration_config")) {
                return { error: null, count: writeCount(options, 0) };
              }

              configRow = {
                ...configRow,
                ...payload,
              };
              return { error: null, count: writeCount(options, 1) };
            },
          }),
        };
      }

      if (table === "migration_detail_lines") {
        return {
          select: () => ({
            eq: async (_field: string, value: string) => ({
              data: lineRows.filter((line) => line.proposal_id === value),
              error: null,
            }),
          }),
          insert: async (
            payload: Record<string, unknown> | Record<string, unknown>[]
          ) => {
            if (refusedTables.has("migration_detail_lines")) {
              // RLS refuses inserts with an error, unlike updates/deletes.
              return {
                error: {
                  code: "42501",
                  message:
                    'new row violates row-level security policy for table "migration_detail_lines"',
                },
              };
            }
            const items = Array.isArray(payload) ? payload : [payload];
            for (const item of items) {
              lineInserts.push(item);
              lineRows = [
                ...lineRows,
                {
                  id: `new-line-${lineInserts.length}`,
                  proposal_id: String(item.proposal_id),
                  section: item.section as LineRow["section"],
                  label: String(item.label),
                  quantity: Number(item.quantity),
                  items_per_object: Number(item.items_per_object),
                  total_line_items: Number(item.total_line_items),
                  row_order: Number(item.row_order),
                },
              ];
            }
            return { error: null };
          },
          update: (
            payload: Record<string, unknown>,
            options?: { count?: string }
          ) => ({
            eq: async (_field: string, id: string) => {
              lineUpdates.push({ id, payload });
              const lineIndex = lineRows.findIndex((line) => line.id === id);
              if (lineIndex === -1) {
                return { error: { message: "Line not found" }, count: null };
              }
              if (refusedTables.has("migration_detail_lines")) {
                return { error: null, count: writeCount(options, 0) };
              }

              lineRows[lineIndex] = {
                ...lineRows[lineIndex],
                ...payload,
              };
              return { error: null, count: writeCount(options, 1) };
            },
          }),
          delete: (options?: { count?: string }) => ({
            eq: async (field: string, value: string) => {
              lineDeletes.push(value);
              if (refusedTables.has("migration_detail_lines")) {
                return { error: null, count: writeCount(options, 0) };
              }
              const before = lineRows.length;
              lineRows =
                field === "proposal_id"
                  ? lineRows.filter((line) => line.proposal_id !== value)
                  : lineRows.filter((line) => line.id !== value);
              return {
                error: null,
                count: writeCount(options, before - lineRows.length),
              };
            },
          }),
        };
      }

      throw new Error(`Unexpected table mock: ${table}`);
    });
  });

  it("rejects unauthenticated callers before loading proposal data", async () => {
    authAssertMock.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "You must be signed in.")
    );

    const result = await addMigrationDetailLine(proposalId, "project");

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to add migration rows.",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects add requests when migration_config is missing", async () => {
    configRow = null;

    const result = await addMigrationDetailLine(proposalId, "workflow");

    expect(result).toEqual({
      ok: false,
      error:
        "Migration Services Unavailable. This proposal is missing its migration configuration row.",
    });
    expect(lineInserts).toEqual([]);
  });

  it("reports a refused add with the shared permission message", async () => {
    refusedTables.add("migration_detail_lines");

    const result = await addMigrationDetailLine(proposalId, "workflow");

    expect(result).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
    expect(lineInserts).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("adds a row at max row_order + 1, returns ordered lines, and persists computed_total_cost", async () => {
    const result = await addMigrationDetailLine(proposalId, "workflow");

    expect(result.ok).toBe(true);
    expect(lineInserts).toEqual([
      {
        proposal_id: proposalId,
        section: "workflow",
        label: "WF Object Name",
        quantity: 0,
        items_per_object: 0,
        total_line_items: 0,
        row_order: 4,
      },
    ]);
    expect(configUpdates.at(-1)).toMatchObject({
      id: "cfg-1",
      payload: expect.objectContaining({
        computed_total_cost: 4321,
      }),
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/proposals/${proposalId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/proposals/${proposalId}/migration`
    );

    if (!result.ok) {
      throw new Error("Expected addMigrationDetailLine to succeed.");
    }

    expect(result.lines.map((line) => line.id)).toEqual([
      "22222222-2222-4222-8222-222222222221",
      "33333333-3333-4333-8333-333333333331",
      "33333333-3333-4333-8333-333333333332",
      "new-line-1",
      "44444444-4444-4444-8444-444444444441",
    ]);
    expect(result.lines.at(2)?.row_order).toBe(3);
    expect(result.lines.at(3)).toMatchObject({
      id: "new-line-1",
      section: "workflow",
      label: "WF Object Name",
      row_order: 4,
    });
    expect(result.lines[0]).not.toHaveProperty("proposal_id");
  });

  it("fails add before mutating when required rates are missing", async () => {
    fetchRequiredRatesMock.mockResolvedValue({
      ok: false,
      error: "Required rate card rows are missing or have a non-positive rate: Master|Program Manager.",
    });

    const result = await addMigrationDetailLine(proposalId, "cost");

    expect(result).toEqual({
      ok: false,
      error: "Required rate card rows are missing or have a non-positive rate: Master|Program Manager.",
    });
    expect(lineInserts).toEqual([]);
    expect(configUpdates).toEqual([]);
  });

  it("rejects remove requests for rows outside the proposal", async () => {
    const result = await removeMigrationDetailLine(
      proposalId,
      "99999999-9999-4999-8999-999999999999"
    );

    expect(result).toEqual({
      ok: false,
      error: "Migration detail row not found for this proposal.",
    });
    expect(lineDeletes).toEqual([]);
  });

  it("removes a row, resequences the section densely, and persists computed_total_cost", async () => {
    lineRows = [
      lineRows[0],
      {
        id: "33333333-3333-4333-8333-333333333341",
        proposal_id: proposalId,
        section: "workflow",
        label: "Workflow A",
        quantity: 1,
        items_per_object: 100,
        total_line_items: 0,
        row_order: 0,
      },
      {
        id: "33333333-3333-4333-8333-333333333342",
        proposal_id: proposalId,
        section: "workflow",
        label: "Workflow B",
        quantity: 1,
        items_per_object: 200,
        total_line_items: 0,
        row_order: 2,
      },
      {
        id: "33333333-3333-4333-8333-333333333343",
        proposal_id: proposalId,
        section: "workflow",
        label: "Workflow C",
        quantity: 1,
        items_per_object: 300,
        total_line_items: 0,
        row_order: 5,
      },
      lineRows[3],
    ];

    const result = await removeMigrationDetailLine(
      proposalId,
      "33333333-3333-4333-8333-333333333342"
    );

    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("delete_migration_detail_line", {
      p_proposal_id: proposalId,
      p_line_id: "33333333-3333-4333-8333-333333333342",
    });
    // The RPC owns delete + resequence now; the action issues no per-row
    // deletes or updates against migration_detail_lines.
    expect(lineDeletes).toEqual([]);
    expect(lineUpdates).toEqual([]);
    expect(configUpdates.at(-1)).toMatchObject({
      payload: expect.objectContaining({
        computed_total_cost: 4321,
      }),
    });

    if (!result.ok) {
      throw new Error("Expected removeMigrationDetailLine to succeed.");
    }

    const workflowRows = result.lines.filter((line) => line.section === "workflow");
    expect(workflowRows.map((line) => [line.id, line.row_order])).toEqual([
      ["33333333-3333-4333-8333-333333333341", 0],
      ["33333333-3333-4333-8333-333333333343", 1],
    ]);
  });

  it("reports a refused computed-total update after adding a row and does not revalidate", async () => {
    // RLS filters the migration_config UPDATE: no error, zero rows.
    refusedTables.add("migration_config");

    const result = await addMigrationDetailLine(proposalId, "workflow");

    expect(result).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
    expect(configUpdates).toHaveLength(1);
    expect(configRow?.computed_total_cost).toBe(0);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports a remove the RPC's RLS-filtered DELETE refused, without recomputing totals or revalidating", async () => {
    // A non-owner: the SECURITY INVOKER RPC finds the row but its DELETE (and
    // any follow-up config update) affects zero rows without an error.
    refusedTables.add("migration_detail_lines");
    refusedTables.add("migration_config");
    const lineId = "33333333-3333-4333-8333-333333333331";

    const result = await removeMigrationDetailLine(proposalId, lineId);

    expect(result).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
    expect(rpcMock).toHaveBeenCalledWith("delete_migration_detail_line", {
      p_proposal_id: proposalId,
      p_line_id: lineId,
    });
    expect(lineRows.some((line) => line.id === lineId)).toBe(true);
    // The refusal is caught from the reloaded rows, before any total write.
    expect(configUpdates).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports a refused computed-total update after removing a row and does not revalidate", async () => {
    refusedTables.add("migration_config");

    const result = await removeMigrationDetailLine(
      proposalId,
      "33333333-3333-4333-8333-333333333331"
    );

    expect(result).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
    expect(configUpdates).toHaveLength(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("fails remove before mutating when required rates are missing", async () => {
    fetchRequiredRatesMock.mockResolvedValue({
      ok: false,
      error: "Required rate card rows are missing or have a non-positive rate: Master|Travel Cost/Trip.",
    });

    const result = await removeMigrationDetailLine(
      proposalId,
      "33333333-3333-4333-8333-333333333331"
    );

    expect(result).toEqual({
      ok: false,
      error: "Required rate card rows are missing or have a non-positive rate: Master|Travel Cost/Trip.",
    });
    expect(lineDeletes).toEqual([]);
    expect(lineUpdates).toEqual([]);
    expect(configUpdates).toEqual([]);
  });

  it("resets migration services with the transactional RPC and revalidates proposal pages", async () => {
    const result = await resetMigrationServices(proposalId);

    expect(result).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("reset_migration_services", {
      p_proposal_id: proposalId,
    });
    expect(configUpdates).toEqual([]);
    expect(lineDeletes).toEqual([]);
    expect(lineInserts).toEqual([]);
    expect(revalidatePathMock).toHaveBeenCalledWith(`/proposals/${proposalId}`);
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/proposals/${proposalId}/migration`
    );
  });

  it("returns the RPC error without revalidating reset paths", async () => {
    rpcMock.mockResolvedValue({ error: { message: "reset failed" } });

    const result = await resetMigrationServices(proposalId);

    expect(result).toEqual({ ok: false, error: "reset failed" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports a refused Clear Tab as not permitted while the config row exists", async () => {
    // What RLS does to a non-owner: the RPC's UPDATE matches no row, so it
    // raises its "missing row" error even though the row is there.
    rpcMock.mockResolvedValue({
      error: { message: `Missing migration_config row for proposal ${proposalId}` },
    });

    const result = await resetMigrationServices(proposalId);

    expect(result).toEqual({ ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("explains a Clear Tab on a proposal with no migration settings without the raw id", async () => {
    configRow = null;
    rpcMock.mockResolvedValue({
      error: { message: `Missing migration_config row for proposal ${proposalId}` },
    });

    const result = await resetMigrationServices(proposalId);

    expect(result).toEqual({
      ok: false,
      error:
        "Migration settings for this proposal weren't found. Reload the page and try again.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated reset requests before mutating", async () => {
    authAssertMock.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "You must be signed in.")
    );

    const result = await resetMigrationServices(proposalId);

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to clear migration services.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(configUpdates).toEqual([]);
    expect(lineDeletes).toEqual([]);
  });
});
