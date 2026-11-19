import { describe, it, expect } from "vitest";
import {
  buildStaleReportRows,
  describeStaleThresholds,
  type StaleBucketFilter,
} from "../stale-proposals";
import { buildStatusMetricsMap, type StatusHistoryRow } from "../status-history";
import {
  calculateStaleCount,
  type SalesOpsDashboardProposal,
  type StaleThresholds,
} from "@/lib/dashboard/sales-ops";

// 17:00Z is noon in Chicago (CDT), so "N days before now" at the same UTC time
// is exactly N Chicago calendar days.
const NOW = new Date("2026-05-01T17:00:00Z");
const MS_PER_DAY = 86_400_000;

// Live prod and staging values of proposal_stale_thresholds.
const SEEDED = {
  Discovery: 21,
  Scoping: 21,
  "Proposal Draft": 5,
  "Sent for Review": 3,
  Negotiations: 3,
  "Awaiting Sig": 14,
} satisfies StaleThresholds;

const NO_SCOPING: StaleThresholds = { ...SEEDED };
delete NO_SCOPING.Scoping;

function daysAgo(days: number, now: Date = NOW): string {
  return new Date(now.getTime() - days * MS_PER_DAY).toISOString();
}

type Proposal = {
  id: string;
  name: string;
  status: string;
  customer_id: string | null;
  created_at?: string | null;
};

// Listed out of display order on purpose so the sort is exercised.
const PROPOSALS: Proposal[] = [
  {
    id: "sent-10",
    name: "Sent Ten",
    status: "Sent for Review",
    customer_id: "c1",
    created_at: daysAgo(60),
  },
  {
    id: "neg-nohist",
    name: "Negotiations No History",
    status: "Negotiations",
    customer_id: "c1",
    created_at: daysAgo(10),
  },
  {
    id: "disc-21",
    name: "Zulu Discovery",
    status: "Discovery",
    customer_id: "c1",
    created_at: daysAgo(60),
  },
  {
    id: "scop-100",
    name: "Scoping Hundred",
    status: "Scoping",
    customer_id: "c1",
    created_at: daysAgo(200),
  },
  {
    id: "draft-2",
    name: "Draft Two",
    status: "Proposal Draft",
    customer_id: null,
    created_at: daysAgo(60),
  },
  {
    id: "disc-22",
    name: "Alpha Discovery",
    status: "Discovery",
    customer_id: "c1",
    created_at: daysAgo(60),
  },
];

function historyAt(now: Date): StatusHistoryRow[] {
  const row = (
    proposal_id: string,
    new_status: string,
    days: number,
    old_status: string | null = null
  ): StatusHistoryRow => ({
    proposal_id,
    old_status,
    new_status,
    changed_at: daysAgo(days, now),
  });
  return [
    row("sent-10", "Discovery", 30),
    row("sent-10", "Sent for Review", 10, "Discovery"),
    row("disc-21", "Discovery", 21),
    row("disc-22", "Discovery", 22),
    row("draft-2", "Proposal Draft", 2),
    row("scop-100", "Scoping", 100),
  ];
}

const CUSTOMER_NAMES = new Map([["c1", "Acme"]]);

function build(
  options: {
    bucket?: StaleBucketFilter;
    thresholds?: StaleThresholds;
    proposals?: Proposal[];
    history?: StatusHistoryRow[];
    now?: Date;
  } = {}
) {
  const now = options.now ?? NOW;
  return buildStaleReportRows({
    proposals: options.proposals ?? PROPOSALS,
    metrics: buildStatusMetricsMap(options.history ?? historyAt(now), now),
    customerNames: CUSTOMER_NAMES,
    thresholds: options.thresholds ?? SEEDED,
    bucket: options.bucket ?? "all",
    now,
  });
}

function rowById(id: string, rows = build()) {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`row ${id} missing`);
  return row;
}

describe("buildStaleReportRows", () => {
  it("marks a 10-day Sent for Review row stale with thresholdDays 3", () => {
    expect(rowById("sent-10")).toEqual({
      id: "sent-10",
      proposalName: "Sent Ten",
      customerName: "Acme",
      status: "Sent for Review",
      daysInStatus: 10,
      thresholdDays: 3,
      lastActivity: daysAgo(10),
      threshold: "stale",
    });
  });

  it("exactly-at-threshold is fresh (21-day Discovery), over is stale (22-day)", () => {
    const atThreshold = rowById("disc-21");
    expect(atThreshold.daysInStatus).toBe(21);
    expect(atThreshold.thresholdDays).toBe(21);
    expect(atThreshold.threshold).toBe("fresh");

    const over = rowById("disc-22");
    expect(over.daysInStatus).toBe(22);
    expect(over.threshold).toBe("stale");
  });

  it("no history falls back to created_at days", () => {
    const row = rowById("neg-nohist");
    expect(row.daysInStatus).toBe(10);
    expect(row.thresholdDays).toBe(3);
    expect(row.threshold).toBe("stale");
  });

  it("lastActivity falls back to created_at", () => {
    expect(rowById("neg-nohist").lastActivity).toBe(daysAgo(10));
    // With history, lastActivity is the latest transition.
    expect(rowById("sent-10").lastActivity).toBe(daysAgo(10));
    expect(rowById("scop-100").lastActivity).toBe(daysAgo(100));
  });

  it("leaves a row with no history and no created_at unclassified", () => {
    const rows = build({
      proposals: [
        {
          id: "neg-blank",
          name: "Blank",
          status: "Negotiations",
          customer_id: "c1",
          created_at: null,
        },
      ],
      history: [],
    });
    expect(rows).toEqual([
      expect.objectContaining({
        id: "neg-blank",
        daysInStatus: null,
        lastActivity: null,
        thresholdDays: 3,
        threshold: null,
      }),
    ]);
  });

  it("clamps a created_at in the future to 0 days", () => {
    const row = rowById(
      "neg-future",
      build({
        proposals: [
          {
            id: "neg-future",
            name: "Future",
            status: "Negotiations",
            customer_id: "c1",
            created_at: daysAgo(-2),
          },
        ],
        history: [],
      })
    );
    expect(row.daysInStatus).toBe(0);
    expect(row.threshold).toBe("fresh");
  });

  it("does not fall back to created_at when history exists but its date is unparseable (matches the dashboard)", () => {
    const row = rowById(
      "neg-bad",
      build({
        proposals: [
          {
            id: "neg-bad",
            name: "Bad Date",
            status: "Negotiations",
            customer_id: "c1",
            created_at: daysAgo(10),
          },
        ],
        history: [
          {
            proposal_id: "neg-bad",
            old_status: null,
            new_status: "Negotiations",
            changed_at: "not-a-date",
          },
        ],
      })
    );
    expect(row.daysInStatus).toBeNull();
    expect(row.threshold).toBeNull();
    expect(row.lastActivity).toBe("not-a-date");
  });

  it("missing threshold leaves the row unclassified and lists it only under All", () => {
    const all = build({ thresholds: NO_SCOPING, bucket: "all" });
    const scoping = rowById("scop-100", all);
    expect(scoping.daysInStatus).toBe(100);
    expect(scoping.thresholdDays).toBeNull();
    expect(scoping.threshold).toBeNull();

    const stale = build({ thresholds: NO_SCOPING, bucket: "stale" });
    const fresh = build({ thresholds: NO_SCOPING, bucket: "fresh" });
    expect(stale.map((r) => r.id)).not.toContain("scop-100");
    expect(fresh.map((r) => r.id)).not.toContain("scop-100");
    expect(all).toHaveLength(PROPOSALS.length);
  });

  it("bucket=stale returns only stale rows; bucket=fresh only fresh", () => {
    const stale = build({ bucket: "stale" });
    expect(stale.map((r) => r.id)).toEqual([
      "disc-22",
      "scop-100",
      "sent-10",
      "neg-nohist",
    ]);
    expect(stale.every((r) => r.threshold === "stale")).toBe(true);

    const fresh = build({ bucket: "fresh" });
    expect(fresh.map((r) => r.id)).toEqual(["disc-21", "draft-2"]);
    expect(fresh.every((r) => r.threshold === "fresh")).toBe(true);
  });

  it("sorts by PROPOSAL_STATUSES order then name", () => {
    expect(build().map((r) => [r.status, r.proposalName])).toEqual([
      ["Discovery", "Alpha Discovery"],
      ["Discovery", "Zulu Discovery"],
      ["Scoping", "Scoping Hundred"],
      ["Proposal Draft", "Draft Two"],
      ["Sent for Review", "Sent Ten"],
      ["Negotiations", "Negotiations No History"],
    ]);
  });

  it("sorts an unknown status after the known ones", () => {
    const rows = build({
      proposals: [
        { id: "x", name: "A Mystery", status: "Mystery", customer_id: "c1", created_at: daysAgo(1) },
        { id: "d", name: "Z Discovery", status: "Discovery", customer_id: "c1", created_at: daysAgo(1) },
      ],
      history: [],
    });
    expect(rows.map((r) => r.id)).toEqual(["d", "x"]);
    // An untracked status has no threshold.
    expect(rowById("x", rows).threshold).toBeNull();
  });

  it("missing customer shows —", () => {
    expect(rowById("draft-2").customerName).toBe("—");
    const unknown = build({
      proposals: [
        { id: "u", name: "Unknown", status: "Discovery", customer_id: "c-gone", created_at: daysAgo(1) },
      ],
      history: [],
    });
    expect(rowById("u", unknown).customerName).toBe("—");
  });

  it("returns no rows for no proposals", () => {
    expect(build({ proposals: [] })).toEqual([]);
  });

  describe("dashboard parity", () => {
    // Noon, just before midnight and just after midnight in Chicago. The last
    // one is a day later in Chicago, which flips the 21-day Discovery to stale.
    it.each([
      ["2026-05-01T17:00:00Z", "seeded", SEEDED, 4],
      ["2026-05-02T04:30:00Z", "seeded", SEEDED, 4],
      ["2026-05-02T05:30:00Z", "seeded", SEEDED, 5],
      ["2026-05-01T17:00:00Z", "no Scoping", NO_SCOPING, 3],
    ] as const)(
      "stale-bucket count equals calculateStaleCount for the same history, thresholds and now (%s, %s thresholds)",
      (nowIso, _label, thresholds, expected) => {
        const now = new Date(nowIso);
        // History is fixed at the default NOW; only the clock moves.
        const history = historyAt(NOW);
        const metrics = buildStatusMetricsMap(history, now);

        const reportCount = build({
          bucket: "stale",
          thresholds,
          history,
          now,
        }).length;

        const dashboardProposals: SalesOpsDashboardProposal[] = PROPOSALS.map(
          (p) => ({
            id: p.id,
            status: p.status,
            ownerId: null,
            value: 0,
            soldPrice: null,
            loeValue: null,
            loeSignedDate: null,
            statusChangedAt:
              metrics.get(p.id)?.lastChangedAt ?? p.created_at ?? null,
          })
        );
        const dashboardCount = calculateStaleCount(dashboardProposals, {
          now,
          thresholds,
        });

        expect(reportCount).toBe(expected);
        expect(dashboardCount).toBe(reportCount);
      }
    );
  });
});

describe("describeStaleThresholds", () => {
  it("lists every stale-tracked status with its threshold", () => {
    expect(describeStaleThresholds(SEEDED)).toBe(
      "Discovery 21d · Scoping 21d · Proposal Draft 5d · Sent for Review 3d · Negotiations 3d · Awaiting Sig 14d"
    );
  });

  it("shows a missing threshold as 'no threshold'", () => {
    expect(describeStaleThresholds(NO_SCOPING)).toBe(
      "Discovery 21d · Scoping: no threshold · Proposal Draft 5d · Sent for Review 3d · Negotiations 3d · Awaiting Sig 14d"
    );
  });
});
