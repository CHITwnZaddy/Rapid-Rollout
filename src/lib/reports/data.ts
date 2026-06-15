import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRateMap,
  type MigrationConfigRow,
  type MigrationLineRow,
  type ScenarioCostRow,
  type ScopedCostRow,
  type ScopedHoursRow,
} from "./proposal-aggregates";
import {
  buildStatusMetricsMap,
  type StatusHistoryRow,
  type StatusMetrics,
} from "./status-history";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";
import { PROPOSAL_STATUSES } from "@/lib/constants/statuses";

// Shared report fetchers. Every report page needs a customer lookup,
// and four of them need status history. Centralizing the query shape
// here means a schema change (e.g. renaming a column) updates one file
// instead of five, and the helpers are unit-testable in isolation.

export type CustomerMap = Map<string, string>;

const MIGRATION_CONFIG_COLUMNS =
  "proposal_id, num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, complexity_factor, sr_im_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs";

const MIGRATION_LINE_COLUMNS =
  "proposal_id, section, label, quantity, items_per_object, total_line_items, row_order";

const REQUIRED_MIGRATION_RATE_KEYS = [
  SR_IM_RATE_KEY,
  PM_RATE_KEY,
  TRAVEL_RATE_KEY,
  INTERNAL_COST_RATE_KEY,
];

export type ReportProposalRow = {
  id: string;
  name: string;
  status: string;
  customer_id: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  scoped_complexity_factor?: unknown;
};

export type ReportProposalFilters = {
  customerId?: string;
  status?: string;
  statuses?: string[];
  ownerId?: string;
  ownerScope?: "mine" | "team" | "specific";
  currentUserId?: string;
  selectedOwnerId?: string;
  dateColumn?: "created_at" | "updated_at";
  dateFrom?: string;
  dateTo?: string;
  excludeStatuses?: string[];
  orderBy?: "created_at" | "updated_at" | "name";
  ascending?: boolean;
  includeScopedComplexity?: boolean;
  includeCreatedAt?: boolean;
  includeUpdatedAt?: boolean;
  includeCreatedBy?: boolean;
};

export type RevenueAggregateInputs = {
  scenarioRows: ScenarioCostRow[];
  scopedRows: ScopedCostRow[];
  migrationConfigRows: MigrationConfigRow[];
  migrationLineRows: MigrationLineRow[];
  rateMap: Map<string, number>;
};

export type MigrationCostInputs = Pick<
  RevenueAggregateInputs,
  "migrationConfigRows" | "migrationLineRows" | "rateMap"
>;

export type RevenueReportBaseRow = {
  proposal_id: string;
  proposal_name: string;
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  scoped_complexity_factor: unknown;
  p1_cost: unknown;
  p2_cost: unknown;
  p3_cost: unknown;
  opt3_cost: unknown;
  opt1_cost: unknown;
  opt2_cost: unknown;
  scenario_total: unknown;
  scoped_total: unknown;
};

export type RevenueReportBaseFilters = {
  customerId?: string;
  status?: string;
  statuses?: string[];
  ownerId?: string;
  ownerScope?: "mine" | "team" | "specific";
  currentUserId?: string;
  selectedOwnerId?: string;
  dateColumn?: "created_at" | "updated_at";
  dateFrom?: string;
  dateTo?: string;
  excludeStatuses?: string[];
  orderBy?: "created_at" | "updated_at" | "proposal_name";
  ascending?: boolean;
};

export type HoursScenarioRow = {
  id: string;
  proposal_id: string;
  scenario_type: string;
};

export type HoursScenarioLineRow = {
  scenario_id: string;
  sr_im_hours: unknown;
  pm_hours: unknown;
  ba_hours: unknown;
};

export type HoursAggregateInputs = {
  scenarioRows: HoursScenarioRow[];
  scenarioLineRows: HoursScenarioLineRow[];
  scopedRows: ScopedHoursRow[];
  migrationConfigRows: MigrationConfigRow[];
  migrationLineRows: MigrationLineRow[];
  rateMap: Map<string, number>;
};

type ReportQueryResult<T> = {
  data: T | null;
  error?: { message?: string } | null;
};

function reportProposalColumns(filters: ReportProposalFilters): string {
  const columns = ["id", "name", "status", "customer_id"];
  if (filters.includeScopedComplexity) columns.push("scoped_complexity_factor");
  if (filters.includeCreatedAt) columns.push("created_at");
  if (filters.includeUpdatedAt) columns.push("updated_at");
  if (filters.includeCreatedBy) columns.push("created_by");
  return columns.join(", ");
}

function emptyRevenueAggregateInputs(): RevenueAggregateInputs {
  return {
    scenarioRows: [],
    scopedRows: [],
    migrationConfigRows: [],
    migrationLineRows: [],
    rateMap: new Map(),
  };
}

function emptyMigrationCostInputs(): MigrationCostInputs {
  return {
    migrationConfigRows: [],
    migrationLineRows: [],
    rateMap: new Map(),
  };
}

function emptyHoursAggregateInputs(): HoursAggregateInputs {
  return {
    scenarioRows: [],
    scenarioLineRows: [],
    scopedRows: [],
    migrationConfigRows: [],
    migrationLineRows: [],
    rateMap: new Map(),
  };
}

function resolveOwnerId(
  filters: Pick<
    ReportProposalFilters,
    "ownerId" | "ownerScope" | "currentUserId" | "selectedOwnerId"
  >
): string | null {
  if (filters.ownerId) return filters.ownerId;
  if (filters.ownerScope === "mine") return filters.currentUserId ?? null;
  if (filters.ownerScope === "specific") return filters.selectedOwnerId ?? null;
  return null;
}

function applyDateRange<TQuery extends { gte: (column: string, value: string) => TQuery; lte: (column: string, value: string) => TQuery }>(
  query: TQuery,
  filters: Pick<ReportProposalFilters, "dateColumn" | "dateFrom" | "dateTo">
): TQuery {
  const dateColumn = filters.dateColumn ?? "created_at";
  if (filters.dateFrom) {
    query = query.gte(dateColumn, filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte(dateColumn, filters.dateTo);
  }
  return query;
}

// Build the PostgREST `not in` filter from a whitelist of canonical
// statuses. Filtering through PROPOSAL_STATUSES means a caller (or a
// future user-controlled filter) can never smuggle arbitrary strings
// into the hand-built `(a,b)` filter expression.
function validExcludeStatuses(excludeStatuses?: string[]): string[] {
  return (excludeStatuses ?? []).filter((s) =>
    (PROPOSAL_STATUSES as readonly string[]).includes(s)
  );
}

function requireReportData<T>(
  result: ReportQueryResult<T>,
  source: string
): T {
  if (result.error) {
    throw new Error(
      `Could not load ${source}: ${result.error.message ?? "unknown error"}`
    );
  }

  if (result.data == null) {
    throw new Error(`Could not load ${source}: no data returned.`);
  }

  return result.data;
}

export async function fetchReportProposals(
  client: SupabaseClient,
  filters: ReportProposalFilters
): Promise<ReportProposalRow[]> {
  let query = client
    .from("proposals")
    .select(reportProposalColumns(filters));

  if (filters.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  } else if (filters.statuses && filters.statuses.length > 0) {
    query = query.in("status", filters.statuses);
  }
  const ownerId = resolveOwnerId(filters);
  if (ownerId) {
    query = query.eq("created_by", ownerId);
  }
  query = applyDateRange(query, filters);
  const excluded = validExcludeStatuses(filters.excludeStatuses);
  if (excluded.length > 0) {
    query = query.not("status", "in", `(${excluded.join(",")})`);
  }
  if (filters.orderBy) {
    query = query.order(filters.orderBy, {
      ascending: filters.ascending ?? true,
    });
  }

  const result = await query;
  return requireReportData(result, "report proposals") as unknown as ReportProposalRow[];
}

export async function fetchRevenueReportBaseRows(
  client: SupabaseClient,
  filters: RevenueReportBaseFilters
): Promise<RevenueReportBaseRow[]> {
  let query = client
    .from("proposal_revenue_report_base")
    .select(
      "proposal_id, proposal_name, status, customer_id, customer_name, created_by, created_at, updated_at, scoped_complexity_factor, p1_cost, p2_cost, p3_cost, opt1_cost, opt2_cost, opt3_cost, scenario_total, scoped_total"
    );

  if (filters.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  } else if (filters.statuses && filters.statuses.length > 0) {
    query = query.in("status", filters.statuses);
  }
  const ownerId = resolveOwnerId(filters);
  if (ownerId) {
    query = query.eq("created_by", ownerId);
  }
  query = applyDateRange(query, filters);
  const excluded = validExcludeStatuses(filters.excludeStatuses);
  if (excluded.length > 0) {
    query = query.not("status", "in", `(${excluded.join(",")})`);
  }
  if (filters.orderBy) {
    query = query.order(filters.orderBy, {
      ascending: filters.ascending ?? true,
    });
  }

  const result = await query;
  return requireReportData(
    result,
    "revenue report base"
  ) as unknown as RevenueReportBaseRow[];
}

export async function fetchMigrationCostInputs(
  client: SupabaseClient,
  proposalIds: string[]
): Promise<MigrationCostInputs> {
  if (proposalIds.length === 0) return emptyMigrationCostInputs();

  const [migrationRes, migrationLineRes, rateRes] = await Promise.all([
    client
      .from("migration_config")
      .select(MIGRATION_CONFIG_COLUMNS)
      .in("proposal_id", proposalIds),
    client
      .from("migration_detail_lines")
      .select(MIGRATION_LINE_COLUMNS)
      .in("proposal_id", proposalIds),
    client
      .from("rate_cards")
      .select("lookup_key, rate")
      .eq("status", "Active")
      .in("lookup_key", REQUIRED_MIGRATION_RATE_KEYS),
  ]);

  return {
    migrationConfigRows: requireReportData(
      migrationRes,
      "migration config"
    ) as MigrationConfigRow[],
    migrationLineRows: requireReportData(
      migrationLineRes,
      "migration detail lines"
    ) as MigrationLineRow[],
    rateMap: buildRateMap(
      requireReportData(rateRes, "rate cards") as {
        lookup_key: string;
        rate: unknown;
      }[]
    ),
  };
}

export async function fetchRevenueAggregateInputs(
  client: SupabaseClient,
  proposalIds: string[]
): Promise<RevenueAggregateInputs> {
  if (proposalIds.length === 0) return emptyRevenueAggregateInputs();

  const [
    scenarioRes,
    scopedRes,
    migrationRes,
    migrationLineRes,
    rateRes,
  ] = await Promise.all([
    client
      .from("scenarios")
      .select("proposal_id, scenario_type, summary_total_cost, complexity_factor")
      .in("proposal_id", proposalIds),
    client
      .from("scoped_services")
      .select("proposal_id, cost")
      .in("proposal_id", proposalIds),
    client
      .from("migration_config")
      .select(MIGRATION_CONFIG_COLUMNS)
      .in("proposal_id", proposalIds),
    client
      .from("migration_detail_lines")
      .select(MIGRATION_LINE_COLUMNS)
      .in("proposal_id", proposalIds),
    client
      .from("rate_cards")
      .select("lookup_key, rate")
      .eq("status", "Active")
      .in("lookup_key", REQUIRED_MIGRATION_RATE_KEYS),
  ]);

  return {
    scenarioRows: requireReportData(
      scenarioRes,
      "scenarios"
    ) as ScenarioCostRow[],
    scopedRows: requireReportData(
      scopedRes,
      "scoped services"
    ) as ScopedCostRow[],
    migrationConfigRows: requireReportData(
      migrationRes,
      "migration config"
    ) as MigrationConfigRow[],
    migrationLineRows: requireReportData(
      migrationLineRes,
      "migration detail lines"
    ) as MigrationLineRow[],
    rateMap: buildRateMap(
      requireReportData(rateRes, "rate cards") as {
        lookup_key: string;
        rate: unknown;
      }[]
    ),
  };
}

export async function fetchHoursAggregateInputs(
  client: SupabaseClient,
  proposalIds: string[]
): Promise<HoursAggregateInputs> {
  if (proposalIds.length === 0) return emptyHoursAggregateInputs();

  const scenarioRes = await client
    .from("scenarios")
    .select("id, proposal_id, scenario_type")
    .in("proposal_id", proposalIds);
  const scenarioRows = requireReportData(
    scenarioRes,
    "hours scenarios"
  ) as HoursScenarioRow[];
  const scenarioIds = scenarioRows.map((scenario) => scenario.id);

  const [scenarioLineRes, scopedRes, migrationRes, migrationLineRes, rateRes] =
    await Promise.all([
      scenarioIds.length
        ? client
            .from("scenario_lines")
            .select("scenario_id, sr_im_hours, pm_hours, ba_hours")
            .in("scenario_id", scenarioIds)
        : Promise.resolve({ data: [] as HoursScenarioLineRow[], error: null }),
      client
        .from("scoped_services")
        .select("proposal_id, hours, rate_card_lookup_key")
        .in("proposal_id", proposalIds),
      client
        .from("migration_config")
        .select(MIGRATION_CONFIG_COLUMNS)
        .in("proposal_id", proposalIds),
      client
        .from("migration_detail_lines")
        .select(MIGRATION_LINE_COLUMNS)
        .in("proposal_id", proposalIds),
      client
        .from("rate_cards")
        .select("lookup_key, rate")
        .eq("status", "Active")
        .in("lookup_key", REQUIRED_MIGRATION_RATE_KEYS),
    ]);

  return {
    scenarioRows,
    scenarioLineRows: requireReportData(
      scenarioLineRes,
      "scenario lines"
    ) as HoursScenarioLineRow[],
    scopedRows: requireReportData(
      scopedRes,
      "scoped services"
    ) as ScopedHoursRow[],
    migrationConfigRows: requireReportData(
      migrationRes,
      "migration config"
    ) as MigrationConfigRow[],
    migrationLineRows: requireReportData(
      migrationLineRes,
      "migration detail lines"
    ) as MigrationLineRow[],
    rateMap: buildRateMap(
      requireReportData(rateRes, "rate cards") as {
        lookup_key: string;
        rate: unknown;
      }[]
    ),
  };
}

/** All customers keyed by id -> company_name. */
export async function fetchCustomerMap(
  client: SupabaseClient
): Promise<CustomerMap> {
  const { data, error } = await client
    .from("customers")
    .select("id, company_name")
    .order("company_name");
  const customers = requireReportData({ data, error }, "customers") as {
    id: string;
    company_name: string;
  }[];
  return new Map(customers.map((c) => [c.id, c.company_name]));
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
  return buildStatusMetricsMap(
    requireReportData(
      { data, error },
      "proposal status history"
    ) as StatusHistoryRow[],
    now
  );
}
