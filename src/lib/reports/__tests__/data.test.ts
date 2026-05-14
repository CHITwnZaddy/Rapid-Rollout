import { describe, it, expect, vi } from "vitest";
import {
  fetchCustomerMap,
  fetchHoursAggregateInputs,
  fetchMigrationCostInputs,
  fetchRevenueReportBaseRows,
  fetchReportProposals,
  fetchRevenueAggregateInputs,
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

  it("returns empty map on error", async () => {
    const client = mockCustomersClient({ data: null, error: { message: "x" } });
    const map = await fetchCustomerMap(client);
    expect(map.size).toBe(0);
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

  it("returns empty map on error", async () => {
    const client = mockHistoryClient({
      data: null,
      error: { message: "timeout" },
    });
    const map = await fetchStatusHistoryMap(client, ["p1"]);
    expect(map.size).toBe(0);
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
      excludeStatuses: ["Lost", "VOID"],
    });

    const query = queries.get("proposals");
    expect(query?.eq).toHaveBeenCalledWith("customer_id", "customer-1");
    expect(query?.eq).toHaveBeenCalledWith("status", "Won");
    expect(query?.eq).toHaveBeenCalledWith("created_by", "user-1");
    expect(query?.not).toHaveBeenCalledWith("status", "in", "(Lost,VOID)");
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

    expect(queries.get("proposals")?.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-01-01"
    );
    expect(queries.get("proposals")?.lte).toHaveBeenCalledWith(
      "created_at",
      "2026-03-31"
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
      excludeStatuses: ["Lost", "VOID"],
      orderBy: "created_at",
      ascending: false,
    });

    const query = queries.get("proposal_revenue_report_base");
    expect(query?.select).toHaveBeenCalledWith(
      "proposal_id, proposal_name, status, customer_id, customer_name, created_by, created_at, updated_at, scoped_complexity_factor, p1_cost, p2_cost, p3_cost, p4_cost, opt1_cost, opt2_cost, scenario_total, scoped_total"
    );
    expect(query?.eq).toHaveBeenCalledWith("customer_id", "customer-1");
    expect(query?.eq).toHaveBeenCalledWith("status", "Won");
    expect(query?.eq).toHaveBeenCalledWith("created_by", "user-1");
    expect(query?.not).toHaveBeenCalledWith("status", "in", "(Lost,VOID)");
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
    expect(query?.gte).toHaveBeenCalledWith("created_at", "2026-01-01");
    expect(query?.lte).toHaveBeenCalledWith("created_at", "2026-12-31");
  });

  it("returns empty rows on error", async () => {
    const { client } = mockTableClient({
      proposal_revenue_report_base: {
        data: null,
        error: { message: "view unavailable" },
      },
    });

    await expect(fetchRevenueReportBaseRows(client, {})).resolves.toEqual([]);
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
      scenarios: { data: [{ proposal_id: "p1" }], error: null },
      scoped_services: { data: [{ proposal_id: "p1" }], error: null },
      migration_config: { data: [{ proposal_id: "p1" }], error: null },
      migration_detail_lines: { data: [{ proposal_id: "p1" }], error: null },
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
    expect(queries.get("rate_cards")?.in).toHaveBeenCalledWith("lookup_key", [
      "Master|Sr. Implementation Manager",
      "Master|Program Manager",
      "Master|Travel Cost/Trip",
      "Master|Internal Cost Rate",
    ]);
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
      migration_config: { data: [{ proposal_id: "p1" }], error: null },
      migration_detail_lines: { data: [{ proposal_id: "p1" }], error: null },
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
    expect(queries.get("rate_cards")?.in).toHaveBeenCalledWith("lookup_key", [
      "Master|Sr. Implementation Manager",
      "Master|Program Manager",
      "Master|Travel Cost/Trip",
      "Master|Internal Cost Rate",
    ]);
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
    const { client } = mockTableClient({
      scenarios: { data: [], error: null },
      scoped_services: { data: [], error: null },
      migration_config: { data: [], error: null },
      migration_detail_lines: { data: [], error: null },
      rate_cards: { data: [], error: null },
    });

    await fetchHoursAggregateInputs(client, ["p1"]);

    expect(client.from).toHaveBeenCalledWith("scenarios");
    expect(client.from).not.toHaveBeenCalledWith("scenario_lines");
  });

  it("fetches scenario lines when scenarios exist", async () => {
    const { client, queries } = mockTableClient({
      scenarios: {
        data: [{ id: "s1", proposal_id: "p1", scenario_type: "P1" }],
        error: null,
      },
      scenario_lines: { data: [{ scenario_id: "s1" }], error: null },
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
});
