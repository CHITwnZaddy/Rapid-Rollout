import { parseMigrationSection } from "@/lib/calculations/adapters";

type MigrationTable = "migration_config" | "migration_detail_lines";

type SupabaseLike = {
  from: (table: MigrationTable) => {
    select: (columns: string) => unknown;
  };
};

type QueryError = { message: string } | null;

type ConfigQuery<Config> = {
  eq: (
    column: string,
    value: string
  ) => {
    maybeSingle: () => Promise<{ data: Config | null; error: QueryError }>;
  };
};

type LinesQuery<Line> = {
  eq: (
    column: string,
    value: string
  ) => {
    order: (
      column: string
    ) => {
      order: (
        column: string
      ) => Promise<{ data: Line[] | null; error: QueryError }>;
    };
  };
};

export type MigrationLoadResult<Config, Line> =
  | { ok: true; config: Config; lines: Line[] }
  | { ok: false; error: string };

export async function loadMigrationState<Config, Line>(
  supabase: SupabaseLike,
  proposalId: string
): Promise<MigrationLoadResult<Config, Line>> {
  const configQuery = supabase
    .from("migration_config")
    .select("*") as ConfigQuery<Config>;

  const configResult = await configQuery
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (configResult.error) {
    return {
      ok: false,
      error: `Couldn't load migration configuration. ${configResult.error.message}`,
    };
  }

  if (!configResult.data) {
    return {
      ok: false,
      error:
        "This proposal is missing its migration configuration row. New proposals should no longer enter this state, so this likely indicates legacy bad data.",
    };
  }

  const linesQuery = supabase
    .from("migration_detail_lines")
    .select("*") as LinesQuery<Line>;

  const linesResult = await linesQuery
    .eq("proposal_id", proposalId)
    .order("section")
    .order("row_order");

  if (linesResult.error) {
    return {
      ok: false,
      error: `Couldn't load migration detail rows. ${linesResult.error.message}`,
    };
  }

  if (!linesResult.data || linesResult.data.length === 0) {
    return {
      ok: false,
      error:
        "This proposal is missing its migration detail rows. New proposals should no longer enter this state, so this likely indicates legacy bad data.",
    };
  }

  for (const line of linesResult.data) {
    const section = (line as { section?: unknown }).section;

    if (typeof section !== "string") {
      return {
        ok: false,
        error: `Unknown migration detail section: ${String(section)}`,
      };
    }

    try {
      parseMigrationSection(section);
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown migration detail section.",
      };
    }
  }

  return { ok: true, config: configResult.data, lines: linesResult.data };
}
