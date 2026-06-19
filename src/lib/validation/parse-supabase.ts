import type { ZodType } from "zod";

// Zod's error.message is a JSON dump of schema internals; never surface it to
// users. Log the raw error server-side and return this stable, safe message.
const SCHEMA_MISMATCH_MESSAGE =
  "the data was in an unexpected format. Refresh to retry.";

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
    console.error("Supabase result failed schema validation:", parsed.error);
    return { ok: false, error: SCHEMA_MISMATCH_MESSAGE };
  }
  return { ok: true, data: parsed.data };
}
