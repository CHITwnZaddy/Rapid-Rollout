import type { ZodType } from "zod";

/** Parse a Supabase result with Zod into an ok/error union for user-facing load states. */
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
