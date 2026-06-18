import type { ZodType } from "zod";

/**
 * Parse Supabase query results with Zod and return structured errors for
 * pages/actions that render user-facing load states.
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
