import type { SupabaseClient } from "@supabase/supabase-js";
import { NUM } from "@/lib/calculations/num";

export type FetchRatesResult =
  | { ok: true; rates: Map<string, number> }
  | { ok: false; error: string };

// Fail-closed rate-card fetcher. Returns an error result when:
//   (a) the request itself errors,
//   (b) the query succeeds but any required key is missing.
// Callers MUST NOT compute pricing from a partial map — do not reach
// for `rates?.get(key) ?? 0`. The Sr. IM bug class came from exactly
// that pattern: a renamed lookup_key silently zeroed costs.
export async function fetchRequiredRates(
  client: SupabaseClient,
  requiredKeys: string[]
): Promise<FetchRatesResult> {
  const { data, error } = await client
    .from("rate_cards")
    .select("lookup_key, rate")
    .eq("status", "Active")
    .in("lookup_key", requiredKeys);

  if (error || !data) {
    return {
      ok: false,
      error:
        error?.message ??
        "Unable to reach the rate card table. Check your connection and retry.",
    };
  }

  const rates = new Map<string, number>(
    data.map((r) => [r.lookup_key as string, NUM(r.rate)])
  );
  const missing = requiredKeys.filter((k) => !rates.has(k));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required rate card rows: ${missing.join(", ")}.`,
    };
  }

  return { ok: true, rates };
}
