import { describe, expect, it, vi } from "vitest";

import { loadMigrationState } from "./load-migration-state";

type QueryResponse<T> = {
  data: T | null;
  error: { message: string } | null;
};

function createMigrationClient<Config, Line>(responses: {
  config: QueryResponse<Config>;
  lines: QueryResponse<Line[]>;
}) {
  const configMaybeSingle = vi.fn().mockResolvedValue(responses.config);
  const configEq = vi.fn().mockReturnValue({ maybeSingle: configMaybeSingle });
  const configSelect = vi.fn().mockReturnValue({ eq: configEq });

  const linesSecondOrder = vi.fn().mockResolvedValue(responses.lines);
  const linesFirstOrder = vi.fn().mockReturnValue({ order: linesSecondOrder });
  const linesEq = vi.fn().mockReturnValue({ order: linesFirstOrder });
  const linesSelect = vi.fn().mockReturnValue({ eq: linesEq });

  const client = {
    from: vi.fn((table: string) => {
      if (table === "migration_config") {
        return { select: configSelect };
      }

      if (table === "migration_detail_lines") {
        return { select: linesSelect };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    client,
    configEq,
    configMaybeSingle,
    configSelect,
    linesEq,
    linesFirstOrder,
    linesSecondOrder,
    linesSelect,
  };
}

describe("loadMigrationState", () => {
  it("returns the Supabase error when the config query fails", async () => {
    const { client } = createMigrationClient({
      config: { data: null, error: { message: "permission denied" } },
      lines: { data: [], error: null },
    });

    const result = await loadMigrationState(client, "proposal-1");

    expect(result).toEqual({
      ok: false,
      error: "Couldn't load migration configuration. permission denied",
    });
  });

  it("returns the legacy-data message when the config row is missing", async () => {
    const { client, configMaybeSingle } = createMigrationClient({
      config: { data: null, error: null },
      lines: { data: [], error: null },
    });

    const result = await loadMigrationState(client, "proposal-1");

    expect(result).toEqual({
      ok: false,
      error:
        "This proposal is missing its migration configuration row. New proposals should no longer enter this state, so this likely indicates legacy bad data.",
    });
    expect(configMaybeSingle).toHaveBeenCalled();
  });

  it("returns the Supabase error when the detail line query fails", async () => {
    const { client } = createMigrationClient({
      config: { data: { id: "config-1" }, error: null },
      lines: { data: null, error: { message: "network timeout" } },
    });

    const result = await loadMigrationState(client, "proposal-1");

    expect(result).toEqual({
      ok: false,
      error: "Couldn't load migration detail rows. network timeout",
    });
  });

  it("returns the legacy-data message when detail lines are missing", async () => {
    const { client } = createMigrationClient({
      config: { data: { id: "config-1" }, error: null },
      lines: { data: [], error: null },
    });

    const result = await loadMigrationState(client, "proposal-1");

    expect(result).toEqual({
      ok: false,
      error:
        "This proposal is missing its migration detail rows. New proposals should no longer enter this state, so this likely indicates legacy bad data.",
    });
  });

  it("rejects unknown migration detail sections", async () => {
    const { client } = createMigrationClient({
      config: { data: { id: "config-1" }, error: null },
      lines: { data: [{ id: "line-1", section: "unknown" }], error: null },
    });

    const result = await loadMigrationState(client, "proposal-1");

    expect(result).toEqual({
      ok: false,
      error: "Unknown migration detail section: unknown",
    });
  });

  it("returns config and ordered detail lines when both queries succeed", async () => {
    const config = { id: "config-1" };
    const lines = [
      { id: "line-1", section: "project" },
      { id: "line-2", section: "workflow" },
    ];
    const {
      client,
      configEq,
      configMaybeSingle,
      configSelect,
      linesEq,
      linesFirstOrder,
      linesSecondOrder,
      linesSelect,
    } = createMigrationClient({
      config: { data: config, error: null },
      lines: { data: lines, error: null },
    });

    const result = await loadMigrationState(client, "proposal-1");

    expect(result).toEqual({ ok: true, config, lines });
    expect(client.from).toHaveBeenCalledWith("migration_config");
    expect(configSelect).toHaveBeenCalledWith("*");
    expect(configEq).toHaveBeenCalledWith("proposal_id", "proposal-1");
    expect(configMaybeSingle).toHaveBeenCalled();
    expect(client.from).toHaveBeenCalledWith("migration_detail_lines");
    expect(linesSelect).toHaveBeenCalledWith("*");
    expect(linesEq).toHaveBeenCalledWith("proposal_id", "proposal-1");
    expect(linesFirstOrder).toHaveBeenCalledWith("section");
    expect(linesSecondOrder).toHaveBeenCalledWith("row_order");
  });
});
