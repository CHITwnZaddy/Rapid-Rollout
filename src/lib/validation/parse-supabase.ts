import type { ZodType } from "zod";

/**
 * Wraps a Supabase query result ({ data, error }) in a Zod validator so we
 * replace unsafe `as SomeRow[]` casts with real runtime checks.
 *
 * Usage:
 *   const { data, error } = await supabase.from("proposals").select(...);
 *   const proposals = parseSupabaseResult(proposalListSchema, { data, error });
 *
 * Throws on either a Supabase error or a schema mismatch — call sites
 * should catch and render an error state rather than silently displaying
 * bad data.
 */
export class SupabaseParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "SupabaseParseError";
  }
}

export function parseSupabaseResult<T>(
  schema: ZodType<T>,
  result: { data: unknown; error: { message: string } | null }
): T {
  if (result.error) {
    throw new SupabaseParseError(result.error.message, result.error);
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    throw new SupabaseParseError(
      `Supabase response failed schema validation: ${parsed.error.message}`,
      parsed.error
    );
  }
  return parsed.data;
}

/**
 * Non-throwing variant for code paths that want to inspect errors
 * without a try/catch.
 */
export function safeParseSupabaseResult<T>(
  schema: ZodType<T>,
  result: { data: unknown; error: { message: string } | null }
):
  | { ok: true; data: T }
  | { ok: false; error: string } {
  if (result.error) {
    return { ok: false, error: result.error.message };
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}
