import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildStatusMetricsMap,
  type StatusHistoryRow,
  type StatusMetrics,
} from "./status-history";

// Shared report fetchers. Every report page needs a customer lookup,
// and four of them need status history. Centralizing the query shape
// here means a schema change (e.g. renaming a column) updates one file
// instead of five, and the helpers are unit-testable in isolation.

export type CustomerMap = Map<string, string>;

/**
 * All customers keyed by id → company_name. Returns an empty Map on
 * error so reports render an empty state instead of crashing — the
 * page-level UX that already exists (empty result list) handles this
 * gracefully.
 */
export async function fetchCustomerMap(
  client: SupabaseClient
): Promise<CustomerMap> {
  const { data, error } = await client
    .from("customers")
    .select("id, company_name")
    .order("company_name");
  if (error || !data) return new Map();
  return new Map(data.map((c) => [c.id as string, c.company_name as string]));
}

/**
 * Status history metrics keyed by proposal_id. Pass the proposal ids
 * you're rendering; the fetcher runs one `.in()` query and returns a
 * pre-computed Map<id, StatusMetrics>. `now` is injectable so pages
 * that want a stable "as of" timestamp can pin it.
 */
export async function fetchStatusHistoryMap(
  client: SupabaseClient,
  proposalIds: string[],
  now: Date = new Date()
): Promise<Map<string, StatusMetrics>> {
  if (proposalIds.length === 0) return new Map();
  const { data, error } = await client
    .from("proposal_status_history")
    .select("proposal_id, old_status, new_status, changed_at")
    .in("proposal_id", proposalIds);
  if (error || !data) return new Map();
  return buildStatusMetricsMap(data as StatusHistoryRow[], now);
}
