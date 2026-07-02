import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchProposalSubtotal } from "./proposal-subtotal";
import type { Database } from "@/types/database";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";

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

  it("fails closed when a required rate card row is priced at zero", async () => {
    // All required rates present, but Internal Cost Rate is a misconfigured 0.
    // A presence-only check would pass it and silently price migration at $0.
    const { client } = mockClient({
      proposals: { data: { scoped_complexity_factor: 1 }, error: null },
      scenarios: { data: [], error: null },
      scoped_services: { data: [], error: null },
      migration_config: {
        data: {
          num_projects: 1,
          hrs_per_import: 4,
          lines_per_import_file: 1000,
          is_effort_included: true,
          is_workshop_included: false,
          complexity_factor: 1,
          sr_im_trips: 0,
          pm_trips: 0,
          doc_avg_mb_per_project: 0,
          doc_mb_per_hour: 0,
          core_requirements_hrs: 0,
          core_migration_plan_hrs: 0,
          core_validation_hrs: 0,
          core_final_qa_hrs: 0,
          core_pm_oversight_hrs: 0,
        },
        error: null,
      },
      migration_detail_lines: { data: [], error: null },
      rate_cards: {
        data: [
          { lookup_key: SR_IM_RATE_KEY, rate: 200 },
          { lookup_key: PM_RATE_KEY, rate: 250 },
          { lookup_key: TRAVEL_RATE_KEY, rate: 1000 },
          { lookup_key: INTERNAL_COST_RATE_KEY, rate: 0 },
        ],
        error: null,
      },
    });

    const result = await fetchProposalSubtotal(client, "proposal-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/non-positive rate/i);
    }
  });
});
