import { describe, expect, it, vi } from "vitest";
import {
  loadScenarioBreakoutData,
  type ScenarioBreakoutClient,
} from "../scenario-breakout-data";

type MockResponse = {
  data: unknown;
  error: { message: string } | null;
};

type MockQuery = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: Promise<MockResponse>["then"];
};

function createQuery(response: MockResponse): MockQuery {
  const promise = Promise.resolve(response);
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    single: vi.fn(async () => response),
    maybeSingle: vi.fn(async () => response),
    then: promise.then.bind(promise),
  };
  return query;
}

function migrationConfig() {
  return {
    num_projects: 2,
    hrs_per_import: 4,
    lines_per_import_file: 1000,
    is_effort_included: false,
    is_workshop_included: false,
    complexity_factor: 1,
    sr_im_trips: 0,
    pm_trips: 0,
    doc_avg_mb_per_project: 0,
    doc_mb_per_hour: 50,
    core_requirements_hrs: 0,
    core_migration_plan_hrs: 0,
    core_validation_hrs: 0,
    core_final_qa_hrs: 0,
    core_pm_oversight_hrs: 0,
    computed_total_cost: 0,
  };
}

function baseResponses(): Record<string, MockResponse> {
  return {
    scenarios: {
      data: [
        {
          id: "scenario-p2",
          scenario_type: "P2",
          summary_total_cost: 200,
          complexity_factor: 1,
        },
        {
          id: "scenario-p1",
          scenario_type: "P1",
          summary_total_cost: 100,
          complexity_factor: 1.5,
        },
      ],
      error: null,
    },
    scenario_lines: {
      data: [
        {
          scenario_id: "scenario-p1",
          module: "Core",
          scope_selection: "Full",
          total_cost: 50,
        },
        {
          scenario_id: "scenario-p1",
          module: "Zero",
          scope_selection: "None",
          total_cost: 0,
        },
        {
          scenario_id: "scenario-p2",
          module: "Reports",
          scope_selection: "Limited",
          total_cost: 200,
        },
      ],
      error: null,
    },
    scoped_services: {
      data: [
        {
          service_type: "Training",
          description: "Admin workshop",
          cost: 100,
        },
        {
          service_type: "Zero",
          description: null,
          cost: 0,
        },
      ],
      error: null,
    },
    migration_config: {
      data: migrationConfig(),
      error: null,
    },
    migration_detail_lines: {
      data: [
        {
          section: "project",
          label: "Projects",
          quantity: 1,
          items_per_object: 1000,
          total_line_items: 0,
        },
      ],
      error: null,
    },
    proposals: {
      data: {
        scoped_complexity_factor: 2,
      },
      error: null,
    },
  };
}

function mockClient(overrides: Partial<Record<string, MockResponse>> = {}) {
  const responses = { ...baseResponses(), ...overrides };
  const queries = new Map<string, MockQuery>();
  const client = {
    from: vi.fn((table: string) => {
      const response = responses[table];
      if (!response) throw new Error(`No mock response for ${table}`);
      const query = createQuery(response);
      queries.set(table, query);
      return query;
    }),
  };
  return { client: client as unknown as ScenarioBreakoutClient, queries };
}

const rates = {
  srImRate: 300,
  pmRate: 250,
  travelRate: 1000,
  internalCostRate: 100,
};

describe("loadScenarioBreakoutData", () => {
  it.each([
    ["scenarios", "Scenarios"],
    ["scenario_lines", "Scenario lines"],
    ["scoped_services", "Scoped services"],
    ["migration_config", "Migration configuration"],
    ["migration_detail_lines", "Migration detail lines"],
    ["proposals", "Proposal"],
  ])("fails closed when %s cannot be loaded", async (table, label) => {
    const { client } = mockClient({
      [table]: {
        data: null,
        error: { message: "permission denied" },
      },
    });

    const result = await loadScenarioBreakoutData(client, "proposal-1", rates);

    expect(result).toEqual({
      ok: false,
      error: `${label} failed to load. permission denied`,
    });
  });

  it("builds ordered groups, scoped rows, and live migration totals", async () => {
    const { client, queries } = mockClient();

    const result = await loadScenarioBreakoutData(client, "proposal-1", rates);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(queries.get("migration_config")?.maybeSingle).toHaveBeenCalled();
    expect(result.scenarioGroups.map((group) => group.scenarioType)).toEqual([
      "P1",
      "P2",
    ]);
    expect(result.scenarioGroups[0]).toEqual({
      scenarioType: "P1",
      lines: [
        {
          module: "Core",
          scope_selection: "Full",
          total_cost: 75,
        },
      ],
      totalCost: 150,
    });
    expect(result.scopedLines).toEqual([
      {
        service_type: "Training",
        description: "Admin workshop",
        cost: 200,
      },
    ]);
    expect(result.migrationBreakdownRows).toEqual([
      {
        label: "Project & Schedule Data Migration",
        total: 2400,
      },
    ]);
    expect(result.migrationLiveTotal).toBe(2400);
  });
});
