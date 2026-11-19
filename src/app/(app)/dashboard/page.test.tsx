// Renders the async dashboard server component with a fake Supabase client
// and checks the queries it builds (D2: undated pipeline snapshot; Closed Won
// by LoE signed date; D7: target progress over the whole target year) and the
// numbers and copy it renders.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { formatCurrency } from "@/lib/calculations/engine";
import { OPEN_PROPOSAL_STATUSES } from "@/lib/proposals/status";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import DashboardPage from "@/app/(app)/dashboard/page";

type Call = { method: string; args: unknown[] };
type Query = { table: string; calls: Call[] };
type TableResult = { data: unknown; error: { message: string } | null };

function baseRow(
  id: string,
  status: string,
  createdAt: string,
  p1: number,
  createdBy = "u-other"
) {
  return {
    proposal_id: id,
    proposal_name: id,
    status,
    customer_id: null,
    customer_name: null,
    created_by: createdBy,
    created_at: createdAt,
    updated_at: createdAt,
    scoped_complexity_factor: 1,
    p1_cost: p1,
    p2_cost: 0,
    p3_cost: 0,
    opt1_cost: 0,
    opt2_cost: 0,
    opt3_cost: 0,
    scenario_total: p1,
    scoped_total: 0,
  };
}

const PIPELINE = [
  baseRow("p-old", "Scoping", "2025-03-01T15:00:00Z", 1000),
  baseRow("p-new", "Negotiations", "2026-11-02T15:00:00Z", 2500, "u-me"),
  baseRow("p-hold", "On Hold", "2026-01-05T15:00:00Z", 500),
];

const CLOSED = [
  {
    id: "c-oct",
    status: "Closed Won",
    created_by: "u-me",
    sold_price: "50000",
    loe_value: "45000",
    loe_signed_date: "2026-10-15",
  },
  {
    id: "c-june",
    status: "Closed Won",
    created_by: "u-other",
    sold_price: 100000,
    loe_value: 110000,
    loe_signed_date: "2026-06-01",
  },
  {
    id: "c-prev",
    status: "Closed Won",
    created_by: "u-other",
    sold_price: 20000,
    loe_value: 20000,
    loe_signed_date: "2025-12-20",
  },
];

function defaultTables(): Record<string, TableResult> {
  return {
    proposal_revenue_report_base: { data: PIPELINE, error: null },
    proposals: { data: CLOSED, error: null },
    proposal_stale_thresholds: {
      data: [
        { status: "Scoping", threshold_days: 14 },
        { status: "Negotiations", threshold_days: 30 },
      ],
      error: null,
    },
    proposal_status_history: { data: [], error: null },
    migration_config: { data: [], error: null },
    migration_detail_lines: { data: [], error: null },
    rate_cards: {
      data: [SR_IM_RATE_KEY, PM_RATE_KEY, TRAVEL_RATE_KEY, INTERNAL_COST_RATE_KEY].map(
        (lookup_key) => ({ lookup_key, rate: 100 })
      ),
      error: null,
    },
    kpi_year_targets: { data: { team_quota: 300000 }, error: null },
    kpi_user_targets: { data: { target_amount: 200000 }, error: null },
  };
}

function makeClient(
  tables: Record<string, TableResult>,
  user: { id: string; app_metadata: { role?: string } } | null
) {
  const queries: Query[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table: string) {
      const q: Query = { table, calls: [] };
      queries.push(q);
      const result = (): TableResult =>
        tables[table] ?? { data: null, error: { message: `unexpected table ${table}` } };
      const builder: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              return (
                resolve: (v: TableResult) => unknown,
                reject: (e: unknown) => unknown
              ) => Promise.resolve(result()).then(resolve, reject);
            }
            if (prop === "maybeSingle") {
              return () => {
                q.calls.push({ method: "maybeSingle", args: [] });
                return Promise.resolve(result());
              };
            }
            return (...args: unknown[]) => {
              q.calls.push({ method: String(prop), args });
              return builder;
            };
          },
        }
      );
      return builder;
    },
  };
  return { client, queries };
}

function only(queries: Query[], table: string): Query {
  const matches = queries.filter((q) => q.table === table);
  expect(matches, `queries on ${table}`).toHaveLength(1);
  return matches[0];
}

function callsOf(q: Query, method: string) {
  return q.calls.filter((c) => c.method === method).map((c) => c.args);
}

async function render(
  sp: Record<string, string>,
  options: {
    role?: string;
    tables?: Record<string, TableResult>;
  } = {}
) {
  const { client, queries } = makeClient(options.tables ?? defaultTables(), {
    id: "u-me",
    app_metadata: { role: options.role },
  });
  vi.mocked(createClient).mockResolvedValue(client as never);
  const element = await DashboardPage({ searchParams: Promise.resolve(sp) });
  const html = renderToStaticMarkup(element).replace(/<!-- -->/g, "");
  return { html, queries };
}

function reportHrefs(html: string): string[] {
  return [...html.matchAll(/href="(\/reports\/[^"]*)"/g)].map((m) =>
    m[1].replace(/&amp;/g, "&")
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 2026-11-19 12:00 in Chicago.
  vi.setSystemTime(new Date("2026-11-19T18:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("dashboard page", () => {
  it("team + current quarter: pipeline is an undated snapshot, closed won is fetched over the target year", async () => {
    const { html, queries } = await render(
      { scope: "team", range: "current-quarter" },
      { role: "admin" }
    );

    const pipeline = only(queries, "proposal_revenue_report_base");
    expect(callsOf(pipeline, "in")).toEqual([["status", [...OPEN_PROPOSAL_STATUSES]]]);
    expect(callsOf(pipeline, "gte")).toEqual([]);
    expect(callsOf(pipeline, "lt")).toEqual([]);
    expect(callsOf(pipeline, "lte")).toEqual([]);
    expect(callsOf(pipeline, "eq")).toEqual([]);

    const closed = only(queries, "proposals");
    expect(callsOf(closed, "eq")).toEqual([["status", "Closed Won"]]);
    // Union of Q4 2026 and the 2026 target year.
    expect(callsOf(closed, "gte")).toEqual([["loe_signed_date", "2026-01-01"]]);
    expect(callsOf(closed, "lte")).toEqual([["loe_signed_date", "2026-12-31"]]);

    const thresholds = only(queries, "proposal_stale_thresholds");
    expect(callsOf(thresholds, "eq")).toEqual([["is_active", true]]);

    const target = only(queries, "kpi_year_targets");
    expect(callsOf(target, "eq")).toContainEqual(["year", 2026]);

    // History and migration costs are read for the pipeline ids only.
    const history = only(queries, "proposal_status_history");
    expect(callsOf(history, "in")).toEqual([["proposal_id", ["p-old", "p-new", "p-hold"]]]);

    // Open value: every open proposal, including one created in 2025.
    expect(html).toContain(formatCurrency(4000));
    // Target progress is year to date for 2026: 100,000 + 50,000 of 300,000.
    expect(html).toContain("50.0%");
    expect(html).toContain(`Annual target: ${formatCurrency(300000)}`);
    expect(html).toContain(`Annual remaining: ${formatCurrency(150000)}`);
    // The closed-won line follows the quarter.
    expect(html).toContain(`Closed won (Q4 2026): ${formatCurrency(50000)}`);
    // Variance follows the quarter: only c-oct (45,000 - 50,000).
    expect(html).toContain(formatCurrency(-5000));
    expect(html).toContain("Closed Won, LoE signed Q4 2026");
    expect(html).toContain("Closed won: Q4 2026");
    expect(html).not.toContain("Closed sold in range");
    expect(html).not.toContain("Unable to load dashboard data");

    // Drill-downs carry no dates.
    const hrefs = reportHrefs(html);
    expect(hrefs).toContain("/reports/proposal-log?scope=team&from=dashboard&status=open");
    expect(hrefs).toContain("/reports/stale-proposals?scope=team&from=dashboard&bucket=stale");
    expect(hrefs).toContain("/reports/proposal-log?scope=team&from=dashboard&status=On+Hold");
    expect(hrefs).toContain("/reports/proposal-log?scope=team&from=dashboard&status=Scoping");
    for (const href of hrefs) {
      expect(href).not.toMatch(/date|range/i);
    }
  });

  it("counts follow-up and on-hold from the snapshot", async () => {
    const { html } = await render({ scope: "team" }, { role: "admin" });
    // p-old (Scoping since 2025-03-01, threshold 14) is stale; p-new is not.
    expect(html).toMatch(/Needs follow-up<\/p><div[^>]*>1<\/div>/);
    expect(html).toMatch(/On hold<\/p><div[^>]*>1<\/div>/);
  });

  it("custom range across two years: target uses the start year, fetch covers the union", async () => {
    const { html, queries } = await render(
      { scope: "team", range: "custom", dateFrom: "2025-11-01", dateTo: "2026-02-28" },
      { role: "manager" }
    );
    const closed = only(queries, "proposals");
    expect(callsOf(closed, "gte")).toEqual([["loe_signed_date", "2025-01-01"]]);
    expect(callsOf(closed, "lte")).toEqual([["loe_signed_date", "2026-02-28"]]);
    const target = only(queries, "kpi_year_targets");
    expect(callsOf(target, "eq")).toContainEqual(["year", 2025]);

    // 2025 YTD: only c-prev (20,000 of 300,000).
    expect(html).toContain("6.7%");
    expect(html).toContain(
      `Closed won (2025-11-01 to 2026-02-28): ${formatCurrency(20000)}`
    );
    expect(html).toContain("Closed Won, LoE signed 2025-11-01 to 2026-02-28");
  });

  it("custom range inside the year: fetch still covers the whole target year", async () => {
    const { html, queries } = await render(
      { scope: "team", range: "custom", dateFrom: "2026-06-01", dateTo: "2026-06-30" },
      { role: "admin" }
    );
    const closed = only(queries, "proposals");
    expect(callsOf(closed, "gte")).toEqual([["loe_signed_date", "2026-01-01"]]);
    expect(callsOf(closed, "lte")).toEqual([["loe_signed_date", "2026-12-31"]]);
    expect(html).toContain("50.0%");
    expect(html).toContain(`Closed won (2026-06-01 to 2026-06-30): ${formatCurrency(100000)}`);
  });

  it("mine scope filters both queries by owner and reads the user target", async () => {
    const { queries } = await render({ range: "current-year" }, { role: "user" });
    const pipeline = only(queries, "proposal_revenue_report_base");
    expect(callsOf(pipeline, "eq")).toEqual([["created_by", "u-me"]]);
    const closed = only(queries, "proposals");
    expect(callsOf(closed, "eq")).toEqual([
      ["status", "Closed Won"],
      ["created_by", "u-me"],
    ]);
    const target = only(queries, "kpi_user_targets");
    expect(callsOf(target, "eq")).toEqual(
      expect.arrayContaining([
        ["year", 2026],
        ["user_id", "u-me"],
      ])
    );
  });

  it("an invalid custom date falls back instead of reaching the query", async () => {
    const { html, queries } = await render(
      { scope: "team", range: "custom", dateFrom: "2026-02-30", dateTo: "2026-03-31" },
      { role: "admin" }
    );
    const closed = only(queries, "proposals");
    expect(callsOf(closed, "gte")).toEqual([["loe_signed_date", "2026-01-01"]]);
    expect(html).not.toContain("Unable to load dashboard data");
  });

  it("a closed-won query failure shows the error card", async () => {
    const tables = defaultTables();
    tables.proposals = { data: null, error: { message: "boom" } };
    const { html } = await render({ scope: "team" }, { role: "admin", tables });
    expect(html).toContain("Unable to load dashboard data");
    expect(html).toContain("Could not load closed-won financials: boom");
  });
});
