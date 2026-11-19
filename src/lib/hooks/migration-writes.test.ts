import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { PROPOSAL_CHANGE_NOT_SAVED } from "@/lib/supabase/affected-rows";
import { MigrationSaveRefusedError } from "./migration-persistence";
import {
  writeMigrationComputedTotal,
  writeMigrationConfig,
  writeMigrationLine,
} from "./migration-writes";

type WriteReply = { error: { message: string } | null; count: number | null };
type LookupReply = {
  data: { id: string } | null;
  error: { message: string } | null;
};

// A fake of the two chains these writes use:
//   from(t).update(fields, opts).eq(col, val)            -> WriteReply
//   from(t).select(cols).eq(col, val).maybeSingle()       -> LookupReply
function fakeClient(write: WriteReply, lookup?: LookupReply) {
  const updateEq = vi.fn(async () => write);
  const update = vi.fn(() => ({ eq: updateEq }));
  const maybeSingle = vi.fn(async () => lookup ?? { data: null, error: null });
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const from = vi.fn(() => ({ update, select }));

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    update,
    updateEq,
    select,
    selectEq,
  };
}

async function thrownBy(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

const LINE = {
  id: "line-1",
  label: "Projects",
  quantity: 3,
  items_per_object: 10,
  total_line_items: 30,
};

describe("writeMigrationConfig", () => {
  it("asks for an exact count and saves when one row changed", async () => {
    const fake = fakeClient({ error: null, count: 1 });

    await expect(
      writeMigrationConfig(fake.client, "cfg-1", { num_projects: 4 })
    ).resolves.toBeUndefined();

    expect(fake.from).toHaveBeenCalledWith("migration_config");
    expect(fake.update).toHaveBeenCalledWith(
      { num_projects: 4 },
      { count: "exact" }
    );
    expect(fake.updateEq).toHaveBeenCalledWith("id", "cfg-1");
  });

  it("reports the write as not saved when it changed zero rows (deleted row / ended session)", async () => {
    const fake = fakeClient({ error: null, count: 0 });

    const error = await thrownBy(
      writeMigrationConfig(fake.client, "cfg-1", { num_projects: 4 })
    );

    expect(error).toBeInstanceOf(MigrationSaveRefusedError);
    expect((error as Error).message).toBe(PROPOSAL_CHANGE_NOT_SAVED);
  });

  it("keeps a Supabase error retryable", async () => {
    const fake = fakeClient({ error: { message: "network down" }, count: null });

    const error = await thrownBy(
      writeMigrationConfig(fake.client, "cfg-1", { num_projects: 4 })
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(MigrationSaveRefusedError);
    expect((error as Error).message).toBe(
      "Couldn't save migration configuration. network down"
    );
  });
});

describe("writeMigrationLine", () => {
  it("asks for an exact count and does not look the row up when it saved", async () => {
    const fake = fakeClient({ error: null, count: 1 });

    await expect(writeMigrationLine(fake.client, LINE)).resolves.toBeUndefined();

    expect(fake.from).toHaveBeenCalledWith("migration_detail_lines");
    expect(fake.update).toHaveBeenCalledWith(
      {
        label: "Projects",
        quantity: 3,
        items_per_object: 10,
        total_line_items: 30,
      },
      { count: "exact" }
    );
    expect(fake.updateEq).toHaveBeenCalledWith("id", "line-1");
    expect(fake.select).not.toHaveBeenCalled();
  });

  it("treats zero rows as nothing to save when the row was removed (e.g. Clear Tab)", async () => {
    const fake = fakeClient(
      { error: null, count: 0 },
      { data: null, error: null }
    );

    await expect(writeMigrationLine(fake.client, LINE)).resolves.toBeUndefined();

    expect(fake.select).toHaveBeenCalledWith("id");
    expect(fake.selectEq).toHaveBeenCalledWith("id", "line-1");
  });

  it("reports the write as not saved when zero rows changed but the row is still there", async () => {
    const fake = fakeClient(
      { error: null, count: 0 },
      { data: { id: "line-1" }, error: null }
    );

    const error = await thrownBy(writeMigrationLine(fake.client, LINE));

    expect(error).toBeInstanceOf(MigrationSaveRefusedError);
    expect((error as Error).message).toBe(PROPOSAL_CHANGE_NOT_SAVED);
  });

  it("keeps the save retryable when the follow-up lookup fails", async () => {
    const fake = fakeClient(
      { error: null, count: 0 },
      { data: null, error: { message: "timeout" } }
    );

    const error = await thrownBy(writeMigrationLine(fake.client, LINE));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(MigrationSaveRefusedError);
    expect((error as Error).message).toBe(
      "Couldn't save migration detail row. timeout"
    );
  });

  it("treats a missing count as a refusal, not a save", async () => {
    const fake = fakeClient({ error: null, count: null });

    await expect(writeMigrationLine(fake.client, LINE)).rejects.toBeInstanceOf(
      MigrationSaveRefusedError
    );
    expect(fake.select).not.toHaveBeenCalled();
  });

  it("keeps a Supabase error retryable", async () => {
    const fake = fakeClient({ error: { message: "network down" }, count: null });

    const error = await thrownBy(writeMigrationLine(fake.client, LINE));

    expect(error).not.toBeInstanceOf(MigrationSaveRefusedError);
    expect((error as Error).message).toBe(
      "Couldn't save migration detail row. network down"
    );
  });
});

describe("writeMigrationComputedTotal", () => {
  it("asks for an exact count and writes the total", async () => {
    const fake = fakeClient({ error: null, count: 1 });

    await expect(
      writeMigrationComputedTotal(fake.client, "cfg-1", 1250)
    ).resolves.toBeUndefined();

    expect(fake.from).toHaveBeenCalledWith("migration_config");
    expect(fake.update).toHaveBeenCalledWith(
      expect.objectContaining({ computed_total_cost: 1250 }),
      { count: "exact" }
    );
    expect(fake.updateEq).toHaveBeenCalledWith("id", "cfg-1");
  });

  it("reports the write as not saved when it changed zero rows (deleted row / ended session)", async () => {
    const fake = fakeClient({ error: null, count: 0 });

    await expect(
      writeMigrationComputedTotal(fake.client, "cfg-1", 1250)
    ).rejects.toBeInstanceOf(MigrationSaveRefusedError);
  });
});
