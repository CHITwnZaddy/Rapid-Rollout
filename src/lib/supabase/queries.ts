import type { SupabaseClient } from "@supabase/supabase-js";
import { NUM } from "@/lib/calculations/num";

export type FetchRatesResult =
  | { ok: true; rates: Map<string, number> }
  | { ok: false; error: string };

// Fail-closed rate-card fetcher. Callers must treat missing required
// rates as errors because pricing from a partial map can silently
// zero costs.
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
  // Fail closed on both absence and non-positive rates: a key present with a
  // rate of 0 would silently zero pricing, so treat it the same as missing.
  const invalid = requiredKeys.filter((k) => !((rates.get(k) ?? 0) > 0));
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `Required rate card rows are missing or have a non-positive rate: ${invalid.join(", ")}.`,
    };
  }

  return { ok: true, rates };
}
