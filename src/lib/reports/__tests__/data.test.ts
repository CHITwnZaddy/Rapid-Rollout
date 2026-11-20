import { describe, it, expect, vi } from "vitest";
import {
  fetchClosedWonFinancials,
  fetchCustomerMap,
  fetchHoursAggregateInputs,
  fetchMigrationCostInputs,
  fetchRevenueReportBaseRows,
  fetchReportProposals,
  fetchRevenueAggregateInputs,
  fetchStaleThresholds,
  fetchStatusHistoryMap,
} from "../data";
import type { SupabaseClient } from "@supabase/supabase-js";

function mockCustomersClient(response: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(response),
  };
  return { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;
}

function mockHistoryClient(response: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue(response),
  };
  return { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient;
}

type QueryMock = {
  select: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  result: { data: unknown; error: unknown };
};

function createQueryMock(response: { data: unknown; error: unknown }): QueryMock {
  const query = {
    result: response,
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    then: vi.fn((resolve) => Promise.resolve(response).then(resolve)),
  };
  query.select.mockReturnValue(query);
  return query;
}

function mockTableClient(
  responses: Record<string, { data: unknown; error: unknown }>
) {
  const queries = new Map<string, QueryMock>();
  const client = {
    from: vi.fn((table: string) => {
      const query = createQueryMock(responses[table] ?? { data: [], error: null });
      queries.set(table, query);
      return query;
    }),
  } as unknown as SupabaseClient & {
    from: ReturnType<typeof vi.fn>;
  };

  return { client, queries };
}

// Full-shape row factories. The fetchers now validate every read against a Zod
// schema, so query-construction tests must supply every selected column (as a
// real PostgREST response would) rather than a `{ proposal_id }` stub.
function scenarioCostRow(overrides: Record<string, unknown> = {}) {
  return {
    proposal_id: "p1",
    scenario_type: "P1",
    summary_total_cost: null,
    complexity_factor: null,
    ...overrides,
  };
}

function scopedCostRow(overrides: Record<string, unknown> = {}) {
  return { proposal_id: "p1", cost: null, ...overrides };
}

function scenarioLineRow(overrides: Record<string, unknown> = {}) {
  return {
    scenario_id: "s1",
    sr_im_hours: null,
    pm_hours: null,
    ba_hours: null,
    ...overrides,
  };
}

function migrationConfigRow(overrides: Record<string, unknown> = {}) {
  return {
    proposal_id: "p1",
    num_projects: null,
    hrs_per_import: null,
    lines_per_import_file: null,
    is_effort_included: false,
    is_workshop_included: false,
    complexity_factor: null,
    sr_im_trips: null,
    pm_trips: null,
    doc_avg_mb_per_project: null,
    doc_mb_per_hour: null,
    core_requirements_hrs: null,
    core_migration_plan_hrs: null,
    core_validation_hrs: null,
    core_final_qa_hrs: null,
    core_pm_oversight_hrs: null,
    ...overrides,
  };
}

function migrationLineRow(overrides: Record<string, unknown> = {}) {
  return {
    proposal_id: "p1",
    section: "project",
    label: "Line",
    quantity: null,
    items_per_object: null,
    total_line_items: null,
    row_order: null,
    ...overrides,
  };
}

describe("fetchCustomerMap", () => {
  it("builds id → company_name map", async () => {
    const client = mockCustomersClient({
      data: [
        { id: "c1", company_name: "Acme" },
        { id: "c2", company_name: "Initech" },
      ],
      error: null,
    });
    const map = await fetchCustomerMap(client);
    expect(map.get("c1")).toBe("Acme");
    expect(map.get("c2")).toBe("Initech");
    expect(map.size).toBe(2);
  });

  it("throws on query error", async () => {
    const client = mockCustomersClient({ data: null, error: { message: "x" } });

    await expect(fetchCustomerMap(client)).rejects.toThrow(
      "Could not load customers: x"
    );
  });
});

describe("fetchStatusHistoryMap", () => {
  it("short-circuits when proposalIds is empty (no query)", async () => {
    const client = mockHistoryClient({ data: [], error: null });
    const map = await fetchStatusHistoryMap(client, []);
    expect(map.size).toBe(0);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns metrics map for provided ids", async () => {
    const now = new Date("2026-04-20T00:00:00Z");
    const client = mockHistoryClient({
      data: [
        {
          proposal_id: "p1",
          old_status: null,
          new_status: "Discovery",
          changed_at: "2026-04-01T00:00:00Z",
        },
        {
          proposal_id: "p1",
          old_status: "Discovery",
          new_status: "Sent for Review",
          changed_at: "2026-04-05T00:00:00Z",
        },
      ],
      error: null,
    });
    const map = await fetchStatusHistoryMap(client, ["p1"], now);
    const metrics = map.get("p1");
    expect(metrics?.currentStatus).toBe("Sent for Review");
    expect(metrics?.firstSentAt).toBe("2026-04-05T00:00:00Z");
    expect(metrics?.daysInCurrentStatus).toBe(15);
  });

  it("throws on query error", async () => {
    const client = mockHistoryClient({
      data: null,
      error: { message: "timeout" },
    });

    await expect(fetchStatusHistoryMap(client, ["p1"])).rejects.toThrow(
      "Could not load proposal status history: timeout"
    );
  });
});

describe("fetchReportProposals", () => {
  it("selects only requested proposal columns", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      includeCreatedAt: true,
      includeCreatedBy: true,
      includeScopedComplexity: true,
      orderBy: "created_at",
      ascending: false,
    });

    expect(queries.get("proposals")?.select).toHaveBeenCalledWith(
      "id, name, status, customer_id, scoped_complexity_factor, created_at, created_by"
    );
    expect(queries.get("proposals")?.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  it("applies customer, status, owner, and exclusion filters", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      customerId: "customer-1",
      status: "Won",
      ownerId: "user-1",
      excludeStatuses: ["Closed Lost", "On Hold"],
    });

    const query = queries.get("proposals");
    expect(query?.eq).toHaveBeenCalledWith("customer_id", "customer-1");
    expect(query?.eq).toHaveBeenCalledWith("status", "Won");
    expect(query?.eq).toHaveBeenCalledWith("created_by", "user-1");
    expect(query?.not).toHaveBeenCalledWith(
      "status",
      "in",
      "(Closed Lost,On Hold)"
    );
  });

  it("drops non-canonical statuses from the exclusion filter", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      excludeStatuses: ["Closed Lost", "VOID', 'injected"],
    });

    // Only whitelisted PROPOSAL_STATUSES values survive into the
    // hand-built `(a,b)` filter string.
    expect(queries.get("proposals")?.not).toHaveBeenCalledWith(
      "status",
      "in",
      "(Closed Lost)"
    );
  });

  it("skips the exclusion filter entirely when no statuses are canonical", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      excludeStatuses: ["NotARealStatus"],
    });

    expect(queries.get("proposals")?.not).not.toHaveBeenCalled();
  });

  it("applies multi-status filters with in()", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      statuses: ["Draft", "Proposal Sent"],
    });

    expect(queries.get("proposals")?.in).toHaveBeenCalledWith("status", [
      "Draft",
      "Proposal Sent",
    ]);
  });

  it("applies mine scope with current user id", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      ownerScope: "mine",
      currentUserId: "user-1",
    });

    expect(queries.get("proposals")?.eq).toHaveBeenCalledWith(
      "created_by",
      "user-1"
    );
  });

  it("applies team scope without owner filtering", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      ownerScope: "team",
      currentUserId: "user-1",
    });

    expect(queries.get("proposals")?.eq).not.toHaveBeenCalledWith(
      "created_by",
      expect.any(String)
    );
  });

  it("applies specific SE scope with selected owner id", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      ownerScope: "specific",
      selectedOwnerId: "se-2",
    });

    expect(queries.get("proposals")?.eq).toHaveBeenCalledWith(
      "created_by",
      "se-2"
    );
  });

  it("applies inclusive date range filters", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      dateColumn: "created_at",
      dateFrom: "2026-01-01",
      dateTo: "2026-03-31",
    });

    // Half-open Chicago days: midnight Jan 1 (CST, UTC-6) up to, but not
    // including, midnight Apr 1 (CDT, UTC-5).
    const query = queries.get("proposals");
    expect(query?.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-01-01T06:00:00.000Z"
    );
    expect(query?.lt).toHaveBeenCalledWith(
      "created_at",
      "2026-04-01T05:00:00.000Z"
    );
    expect(query?.lte).not.toHaveBeenCalled();
  });

  it("updated_at uses Chicago day bounds on the fall-back day", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      dateColumn: "updated_at",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-01",
    });

    // Nov 1 2026 is 25 hours long in Chicago: it starts in CDT and ends in CST.
    const query = queries.get("proposals");
    expect(query?.gte).toHaveBeenCalledWith(
      "updated_at",
      "2026-11-01T05:00:00.000Z"
    );
    expect(query?.lt).toHaveBeenCalledWith(
      "updated_at",
      "2026-11-02T06:00:00.000Z"
    );
    expect(query?.lte).not.toHaveBeenCalled();
  });

  it("uses Chicago day bounds on the spring-forward day", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      dateColumn: "created_at",
      dateFrom: "2026-03-08",
      dateTo: "2026-03-08",
    });

    // Mar 8 2026 is 23 hours long in Chicago: it starts in CST and ends in CDT.
    const query = queries.get("proposals");
    expect(query?.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-03-08T06:00:00.000Z"
    );
    expect(query?.lt).toHaveBeenCalledWith(
      "created_at",
      "2026-03-09T05:00:00.000Z"
    );
  });

  it("applies only the upper bound when only dateTo is set", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, { dateTo: "2026-03-31" });

    const query = queries.get("proposals");
    expect(query?.lt).toHaveBeenCalledWith(
      "created_at",
      "2026-04-01T05:00:00.000Z"
    );
    expect(query?.gte).not.toHaveBeenCalled();
    expect(query?.lte).not.toHaveBeenCalled();
  });

  it("applies only the lower bound when only dateFrom is set", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, { dateFrom: "2026-01-01" });

    const query = queries.get("proposals");
    expect(query?.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-01-01T06:00:00.000Z"
    );
    expect(query?.lt).not.toHaveBeenCalled();
    expect(query?.lte).not.toHaveBeenCalled();
  });

  it("skips empty-string date bounds", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, { dateFrom: "", dateTo: "" });

    const query = queries.get("proposals");
    expect(query?.gte).not.toHaveBeenCalled();
    expect(query?.lt).not.toHaveBeenCalled();
    expect(query?.lte).not.toHaveBeenCalled();
  });

  it("uses bare inclusive bounds for the DATE column loe_signed_date", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchReportProposals(client, {
      dateColumn: "loe_signed_date",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });

    const query = queries.get("proposals");
    expect(query?.gte).toHaveBeenCalledWith("loe_signed_date", "2026-01-01");
    expect(query?.lte).toHaveBeenCalledWith("loe_signed_date", "2026-12-31");
    expect(query?.lt).not.toHaveBeenCalled();
  });

  it("rejects malformed date filters", async () => {
    const { client } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await expect(
      fetchReportProposals(client, {
        dateColumn: "created_at",
        dateTo: "2026-02-30",
      })
    ).rejects.toThrow("Invalid date filter: 2026-02-30");
  });

  it("rejects malformed date filters on the DATE column", async () => {
    const { client } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await expect(
      fetchReportProposals(client, {
        dateColumn: "loe_signed_date",
        dateFrom: "2026-13-01",
      })
    ).rejects.toThrow("Invalid date filter: 2026-13-01");
  });

  it("throws on query error", async () => {
    const { client } = mockTableClient({
      proposals: {
        data: null,
        error: { message: "permission denied" },
      },
    });

    await expect(fetchReportProposals(client, {})).rejects.toThrow(
      "Could not load report proposals: permission denied"
    );
  });
});

describe("fetchRevenueReportBaseRows", () => {
  it("selects the revenue report base columns and applies filters", async () => {
    const { client, queries } = mockTableClient({
      proposal_revenue_report_base: { data: [], error: null },
    });

    await fetchRevenueReportBaseRows(client, {
      customerId: "customer-1",
      status: "Won",
      ownerId: "user-1",
      excludeStatuses: ["Closed Lost", "On Hold"],
      orderBy: "created_at",
      ascending: false,
    });

    const query = queries.get("proposal_revenue_report_base");
    expect(query?.select).toHaveBeenCalledWith(
      "proposal_id, proposal_name, status, customer_id, customer_name, created_by, created_at, updated_at, scoped_complexity_factor, p1_cost, p2_cost, p3_cost, opt1_cost, opt2_cost, opt3_cost, scenario_total, scoped_total"
    );
    expect(query?.eq).toHaveBeenCalledWith("customer_id", "customer-1");
    expect(query?.eq).toHaveBeenCalledWith("status", "Won");
    expect(query?.eq).toHaveBeenCalledWith("created_by", "user-1");
    expect(query?.not).toHaveBeenCalledWith(
      "status",
      "in",
      "(Closed Lost,On Hold)"
    );
    expect(query?.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
  });

  it("applies multi-status filters with in()", async () => {
    const { client, queries } = mockTableClient({
      proposal_revenue_report_base: { data: [], error: null },
    });

    await fetchRevenueReportBaseRows(client, {
      statuses: ["Draft", "Proposal Sent"],
    });

    expect(queries.get("proposal_revenue_report_base")?.in).toHaveBeenCalledWith(
      "status",
      ["Draft", "Proposal Sent"]
    );
  });

  it("applies preset owner scope, date range, and status arrays", async () => {
    const { client, queries } = mockTableClient({
      proposal_revenue_report_base: { data: [], error: null },
    });

    await fetchRevenueReportBaseRows(client, {
      ownerScope: "specific",
      selectedOwnerId: "se-2",
      statuses: ["Discovery", "Awaiting Sig"],
      dateColumn: "created_at",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });

    const query = queries.get("proposal_revenue_report_base");
    expect(query?.eq).toHaveBeenCalledWith("created_by", "se-2");
    expect(query?.in).toHaveBeenCalledWith("status", [
      "Discovery",
      "Awaiting Sig",
    ]);
    expect(query?.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-01-01T06:00:00.000Z"
    );
    expect(query?.lt).toHaveBeenCalledWith(
      "created_at",
      "2027-01-01T06:00:00.000Z"
    );
    expect(query?.lte).not.toHaveBeenCalled();
  });

  it("throws on query error", async () => {
    const { client } = mockTableClient({
      proposal_revenue_report_base: {
        data: null,
        error: { message: "view unavailable" },
      },
    });

    await expect(fetchRevenueReportBaseRows(client, {})).rejects.toThrow(
      "Could not load revenue report base: view unavailable"
    );
  });
});

describe("fetchClosedWonFinancials", () => {
  it("filters Closed Won by LoE signed date on proposals, not created_at", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchClosedWonFinancials(client, {
      ownerScope: "team",
      currentUserId: "u1",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });

    expect(client.from).toHaveBeenCalledWith("proposals");
    expect(client.from).not.toHaveBeenCalledWith("proposal_revenue_report_base");
    const query = queries.get("proposals");
    expect(query?.select).toHaveBeenCalledWith(
      "id, status, created_by, sold_price, loe_value, loe_signed_date"
    );
    expect(query?.eq).toHaveBeenCalledWith("status", "Closed Won");
    expect(query?.gte).toHaveBeenCalledWith("loe_signed_date", "2026-01-01");
    expect(query?.lte).toHaveBeenCalledWith("loe_signed_date", "2026-12-31");
    expect(query?.lt).not.toHaveBeenCalled();
    expect(query?.gte).not.toHaveBeenCalledWith(
      "created_at",
      expect.anything()
    );
    expect(query?.eq).not.toHaveBeenCalledWith(
      "created_by",
      expect.anything()
    );
    expect(query?.order).toHaveBeenCalledWith("loe_signed_date", {
      ascending: false,
    });
  });

  it("applies mine scope", async () => {
    const { client, queries } = mockTableClient({
      proposals: { data: [], error: null },
    });

    await fetchClosedWonFinancials(client, {
      ownerScope: "mine",
      currentUserId: "u1",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });

    expect(queries.get("proposals")?.eq).toHaveBeenCalledWith(
      "created_by",
      "u1"
    );
  });

  it("returns a deal created in a prior year and coerces numeric strings", async () => {
    const { client } = mockTableClient({
      proposals: {
        data: [
          {
            id: "cw-2025",
            status: "Closed Won",
            created_by: "u1",
            sold_price: "250000.00",
            loe_value: 260000,
            loe_signed_date: "2026-03-31",
          },
        ],
        error: null,
      },
    });

    const rows = await fetchClosedWonFinancials(client, {
      ownerScope: "team",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });

    expect(rows).toEqual([
      {
        id: "cw-2025",
        status: "Closed Won",
        created_by: "u1",
        sold_price: 250000,
        loe_value: 260000,
        loe_signed_date: "2026-03-31",
      },
    ]);
  });

  it("keeps null financial values as null", async () => {
    const { client } = mockTableClient({
      proposals: {
        data: [
          {
            id: "cw-1",
            status: "Closed Won",
            created_by: null,
            sold_price: null,
            loe_value: null,
            loe_signed_date: "2026-05-01",
          },
        ],
        error: null,
      },
    });

    const rows = await fetchClosedWonFinancials(client, {
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });

    expect(rows[0]).toMatchObject({
      created_by: null,
      sold_price: null,
      loe_value: null,
    });
  });

  it("throws on query error", async () => {
    const { client } = mockTableClient({
      proposals: { data: null, error: { message: "boom" } },
    });

    await expect(
      fetchClosedWonFinancials(client, {
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      })
    ).rejects.toThrow("Could not load closed-won financials: boom");
  });
});

describe("fetchStaleThresholds", () => {
  const seededThresholdRows = [
    { status: "Discovery", threshold_days: 21 },
    { status: "Scoping", threshold_days: 21 },
    { status: "Proposal Draft", threshold_days: 5 },
    { status: "Sent for Review", threshold_days: 3 },
    { status: "Negotiations", threshold_days: 3 },
    { status: "Awaiting Sig", threshold_days: 14 },
  ];

  it("reads only active thresholds", async () => {
    const { client, queries } = mockTableClient({
      proposal_stale_thresholds: { data: seededThresholdRows, error: null },
    });

    await fetchStaleThresholds(client);

    expect(client.from).toHaveBeenCalledWith("proposal_stale_thresholds");
    const query = queries.get("proposal_stale_thresholds");
    expect(query?.select).toHaveBeenCalledWith("status, threshold_days");
    expect(query?.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("maps seeded thresholds and drops untracked statuses", async () => {
    const { client } = mockTableClient({
      proposal_stale_thresholds: {
        data: [
          ...seededThresholdRows,
          { status: "On Hold", threshold_days: 7 },
          { status: "Legacy", threshold_days: 9 },
        ],
        error: null,
      },
    });

    await expect(fetchStaleThresholds(client)).resolves.toEqual({
      Discovery: 21,
      Scoping: 21,
      "Proposal Draft": 5,
      "Sent for Review": 3,
      Negotiations: 3,
      "Awaiting Sig": 14,
    });
  });

  it("throws on query error", async () => {
    const { client } = mockTableClient({
      proposal_stale_thresholds: { data: null, error: { message: "boom" } },
    });

    await expect(fetchStaleThresholds(client)).rejects.toThrow(
      "Could not load stale thresholds: boom"
    );
  });

  it("throws on unexpected shape", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { client } = mockTableClient({
      proposal_stale_thresholds: {
        data: [{ status: "Discovery", threshold_days: "3" }],
        error: null,
      },
    });

    try {
      await expect(fetchStaleThresholds(client)).rejects.toThrow(
        "Could not load stale thresholds: the data was in an unexpected format."
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("fetchRevenueAggregateInputs", () => {
  it("short-circuits when proposalIds is empty", async () => {
    const { client } = mockTableClient({});
    const result = await fetchRevenueAggregateInputs(client, []);

    expect(client.from).not.toHaveBeenCalled();
    expect(result.scenarioRows).toEqual([]);
    expect(result.scopedRows).toEqual([]);
    expect(result.migrationConfigRows).toEqual([]);
    expect(result.migrationLineRows).toEqual([]);
    expect(result.rateMap.size).toBe(0);
  });

  it("fetches revenue aggregate source tables and required rates", async () => {
    const { client, queries } = mockTableClient({
      scenarios: { data: [scenarioCostRow()], error: null },
      scoped_services: { data: [scopedCostRow()], error: null },
      migration_config: { data: [migrationConfigRow()], error: null },
      migration_detail_lines: { data: [migrationLineRow()], error: null },
      rate_cards: {
        data: [{ lookup_key: "Sr. Implementation Manager", rate: 1 }],
        error: null,
      },
    });

    await fetchRevenueAggregateInputs(client, ["p1"]);

    expect(client.from).toHaveBeenCalledWith("scenarios");
    expect(client.from).toHaveBeenCalledWith("scoped_services");
    expect(client.from).toHaveBeenCalledWith("migration_config");
    expect(client.from).toHaveBeenCalledWith("migration_detail_lines");
    expect(client.from).toHaveBeenCalledWith("rate_cards");
    expect(queries.get("scenarios")?.in).toHaveBeenCalledWith("proposal_id", [
      "p1",
    ]);
    expect(queries.get("rate_cards")?.eq).toHaveBeenCalledWith(
      "status",
      "Active"
    );
    expect(queries.get("rate_cards")?.in).toHaveBeenCalledWith("lookup_key", [
      "Master|Sr. Implementation Manager",
      "Master|Program Manager",
      "Master|Travel Cost/Trip",
      "Master|Internal Cost Rate",
    ]);
  });

  it("throws when any revenue aggregate query fails", async () => {
    const { client } = mockTableClient({
      scenarios: { data: [], error: null },
      scoped_services: { data: null, error: { message: "rls denied" } },
      migration_config: { data: [], error: null },
      migration_detail_lines: { data: [], error: null },
      rate_cards: { data: [], error: null },
    });

    await expect(fetchRevenueAggregateInputs(client, ["p1"])).rejects.toThrow(
      "Could not load scoped services: rls denied"
    );
  });
});

describe("fetchMigrationCostInputs", () => {
  it("short-circuits when proposalIds is empty", async () => {
    const { client } = mockTableClient({});
    const result = await fetchMigrationCostInputs(client, []);

    expect(client.from).not.toHaveBeenCalled();
    expect(result.migrationConfigRows).toEqual([]);
    expect(result.migrationLineRows).toEqual([]);
    expect(result.rateMap.size).toBe(0);
  });

  it("fetches only migration source tables and required rates", async () => {
    const { client, queries } = mockTableClient({
      migration_config: { data: [migrationConfigRow()], error: null },
      migration_detail_lines: { data: [migrationLineRow()], error: null },
      rate_cards: {
        data: [{ lookup_key: "Master|Program Manager", rate: 1 }],
        error: null,
      },
    });

    await fetchMigrationCostInputs(client, ["p1"]);

    expect(client.from).toHaveBeenCalledWith("migration_config");
    expect(client.from).toHaveBeenCalledWith("migration_detail_lines");
    expect(client.from).toHaveBeenCalledWith("rate_cards");
    expect(client.from).not.toHaveBeenCalledWith("scenarios");
    expect(client.from).not.toHaveBeenCalledWith("scoped_services");
    expect(queries.get("migration_config")?.in).toHaveBeenCalledWith(
      "proposal_id",
      ["p1"]
    );
    expect(queries.get("rate_cards")?.eq).toHaveBeenCalledWith(
      "status",
      "Active"
    );
    expect(queries.get("rate_cards")?.in).toHaveBeenCalledWith("lookup_key", [
      "Master|Sr. Implementation Manager",
      "Master|Program Manager",
      "Master|Travel Cost/Trip",
      "Master|Internal Cost Rate",
    ]);
  });

  it("throws when any migration aggregate query fails", async () => {
    const { client } = mockTableClient({
      migration_config: { data: [], error: null },
      migration_detail_lines: {
        data: null,
        error: { message: "table unavailable" },
      },
      rate_cards: { data: [], error: null },
    });

    await expect(fetchMigrationCostInputs(client, ["p1"])).rejects.toThrow(
      "Could not load migration detail lines: table unavailable"
    );
  });
});

describe("fetchHoursAggregateInputs", () => {
  it("short-circuits when proposalIds is empty", async () => {
    const { client } = mockTableClient({});
    const result = await fetchHoursAggregateInputs(client, []);

    expect(client.from).not.toHaveBeenCalled();
    expect(result.scenarioRows).toEqual([]);
    expect(result.scenarioLineRows).toEqual([]);
    expect(result.scopedRows).toEqual([]);
    expect(result.migrationConfigRows).toEqual([]);
    expect(result.migrationLineRows).toEqual([]);
    expect(result.rateMap.size).toBe(0);
  });

  it("fetches scenarios before scenario lines and skips scenario lines when none exist", async () => {
    const { client, queries } = mockTableClient({
      scenarios: { data: [], error: null },
      scoped_services: { data: [], error: null },
      migration_config: { data: [], error: null },
      migration_detail_lines: { data: [], error: null },
      rate_cards: { data: [], error: null },
    });

    await fetchHoursAggregateInputs(client, ["p1"]);

    expect(client.from).toHaveBeenCalledWith("scenarios");
    expect(client.from).not.toHaveBeenCalledWith("scenario_lines");
    expect(queries.get("rate_cards")?.eq).toHaveBeenCalledWith(
      "status",
      "Active"
    );
  });

  it("fetches scenario lines when scenarios exist", async () => {
    const { client, queries } = mockTableClient({
      scenarios: {
        data: [{ id: "s1", proposal_id: "p1", scenario_type: "P1" }],
        error: null,
      },
      scenario_lines: { data: [scenarioLineRow()], error: null },
      scoped_services: { data: [], error: null },
      migration_config: { data: [], error: null },
      migration_detail_lines: { data: [], error: null },
      rate_cards: { data: [], error: null },
    });

    await fetchHoursAggregateInputs(client, ["p1"]);

    expect(client.from).toHaveBeenCalledWith("scenario_lines");
    expect(queries.get("scenario_lines")?.in).toHaveBeenCalledWith(
      "scenario_id",
      ["s1"]
    );
  });

  it("throws when the hours scenario query fails", async () => {
    const { client } = mockTableClient({
      scenarios: { data: null, error: { message: "view blocked" } },
      scoped_services: { data: [], error: null },
      migration_config: { data: [], error: null },
      migration_detail_lines: { data: [], error: null },
      rate_cards: { data: [], error: null },
    });

    await expect(fetchHoursAggregateInputs(client, ["p1"])).rejects.toThrow(
      "Could not load hours scenarios: view blocked"
    );
  });

  it("throws when the hours scenario-line query fails", async () => {
    const { client } = mockTableClient({
      scenarios: {
        data: [{ id: "s1", proposal_id: "p1", scenario_type: "P1" }],
        error: null,
      },
      scenario_lines: { data: null, error: { message: "line read failed" } },
      scoped_services: { data: [], error: null },
      migration_config: { data: [], error: null },
      migration_detail_lines: { data: [], error: null },
      rate_cards: { data: [], error: null },
    });

    await expect(fetchHoursAggregateInputs(client, ["p1"])).rejects.toThrow(
      "Could not load scenario lines: line read failed"
    );
  });
});
