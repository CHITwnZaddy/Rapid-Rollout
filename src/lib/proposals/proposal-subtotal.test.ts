import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchProposalSubtotal } from "./proposal-subtotal";
import type { Database } from "@/types/database";

type QueryResponse = { data: unknown; error: unknown };

type QueryMock = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
};

function mockClient(responses: Record<string, QueryResponse>) {
  const queries = new Map<string, QueryMock>();
  const client = {
    from: vi.fn((table: string) => {
      const response = responses[table] ?? { data: [], error: null };
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(response),
        maybeSingle: vi.fn().mockResolvedValue(response),
        then: vi.fn((resolve) => Promise.resolve(response).then(resolve)),
      };
      queries.set(table, query);
      return query;
    }),
  } as unknown as SupabaseClient<Database> & {
    from: ReturnType<typeof vi.fn>;
  };

  return { client, queries };
}

describe("fetchProposalSubtotal", () => {
  it("loads only active rate-card rows for subtotal pricing", async () => {
    const { client, queries } = mockClient({
      proposals: { data: { scoped_complexity_factor: 1 }, error: null },
      scenarios: { data: [], error: null },
      scoped_services: { data: [], error: null },
      migration_config: { data: null, error: null },
      migration_detail_lines: { data: [], error: null },
      rate_cards: { data: [], error: null },
    });

    await fetchProposalSubtotal(client, "proposal-1");

    expect(client.from).toHaveBeenCalledWith("rate_cards");
    expect(queries.get("rate_cards")?.eq).toHaveBeenCalledWith(
      "status",
      "Active"
    );
    expect(queries.get("rate_cards")?.in).toHaveBeenCalledWith("lookup_key", [
      "Master|Internal Cost Rate",
      "Master|Sr. Implementation Manager",
      "Master|Program Manager",
      "Master|Travel Cost/Trip",
    ]);
  });
});
