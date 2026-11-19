import { describe, it, expect } from "vitest";
import {
  computeStatusMetrics,
  buildStatusMetricsMap,
  type StatusHistoryRow,
} from "../status-history";

const NOW = new Date("2026-04-18T12:00:00Z");

function row(
  proposalId: string,
  new_status: string,
  daysAgo: number,
  old_status: string | null = null
): StatusHistoryRow {
  const changed_at = new Date(
    NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000
  ).toISOString();
  return { proposal_id: proposalId, old_status, new_status, changed_at };
}

function rowAt(
  proposalId: string,
  new_status: string,
  changed_at: string,
  old_status: string | null = null
): StatusHistoryRow {
  return { proposal_id: proposalId, old_status, new_status, changed_at };
}

describe("computeStatusMetrics", () => {
  it("returns all-null for a proposal with no history", () => {
    expect(computeStatusMetrics("p1", [], NOW)).toEqual({
      firstSentAt: null,
      firstWonAt: null,
      lastChangedAt: null,
      daysInCurrentStatus: null,
      daysToClose: null,
      currentStatus: null,
    });
  });

  it("returns daysInCurrentStatus = 0 on same-day transition", () => {
    const rows = [row("p1", "Discovery", 0)];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.daysInCurrentStatus).toBe(0);
    expect(m.currentStatus).toBe("Discovery");
  });

  it("computes firstSentAt, firstWonAt, daysToClose across a full lifecycle", () => {
    const rows = [
      row("p1", "Discovery", 30),
      row("p1", "Sent for Review", 20, "Discovery"),
      row("p1", "Awaiting Sig", 10, "Sent for Review"),
      row("p1", "Closed Won", 5, "Awaiting Sig"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.currentStatus).toBe("Closed Won");
    expect(m.daysInCurrentStatus).toBe(5);
    expect(m.daysToClose).toBe(15); // 20d ago → 5d ago
    expect(m.firstSentAt).not.toBeNull();
    expect(m.firstWonAt).not.toBeNull();
  });

  it("returns null daysToClose when proposal was never sent", () => {
    const rows = [
      row("p1", "Discovery", 30),
      row("p1", "Closed Lost", 5, "Discovery"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.daysToClose).toBeNull();
  });

  it("returns null daysToClose when still in-flight (never Won/Lost)", () => {
    const rows = [
      row("p1", "Discovery", 30),
      row("p1", "Sent for Review", 20, "Discovery"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.daysToClose).toBeNull();
    expect(m.firstSentAt).not.toBeNull();
  });

  it("measures daysToClose to the FIRST close, even if re-opened later", () => {
    const rows = [
      row("p1", "Sent for Review", 40),
      row("p1", "Closed Won", 30, "Sent for Review"),
      row("p1", "Discovery", 20, "Closed Won"),
      row("p1", "Sent for Review", 15, "Discovery"),
      row("p1", "Closed Won", 5, "Sent for Review"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.daysToClose).toBe(10);
  });

  it("sorts mixed-order rows ascending by changed_at", () => {
    const rows = [
      row("p1", "Closed Won", 5, "Sent for Review"),
      row("p1", "Discovery", 30),
      row("p1", "Sent for Review", 20, "Discovery"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.currentStatus).toBe("Closed Won");
    expect(m.daysToClose).toBe(15);
  });

  it("filters out rows belonging to other proposals", () => {
    const rows = [
      row("p1", "Discovery", 30),
      row("p2", "Closed Won", 1, "Discovery"),
      row("p1", "Sent for Review", 10, "Discovery"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.currentStatus).toBe("Sent for Review");
    expect(m.firstWonAt).toBeNull();
  });
});

describe("computeStatusMetrics (America/Chicago calendar days)", () => {
  it("daysInCurrentStatus counts Chicago calendar days across spring-forward", () => {
    // 21 calendar days but only 20 days + 23 hours of elapsed time, because
    // 2026-03-08 is 23 hours long. The old floor-of-ms count gave 20.
    const rows = [rowAt("p1", "Discovery", "2026-03-01T09:00:00-06:00")];
    const m = computeStatusMetrics(
      "p1",
      rows,
      new Date("2026-03-22T09:00:00-05:00")
    );
    expect(m.daysInCurrentStatus).toBe(21);
  });

  it("late-evening change reads 1 day next Chicago morning", () => {
    const rows = [rowAt("p1", "Discovery", "2026-04-21T23:30:00-05:00")];
    const m = computeStatusMetrics(
      "p1",
      rows,
      new Date("2026-04-22T08:00:00-05:00")
    );
    expect(m.daysInCurrentStatus).toBe(1);
  });

  it("25-hour fall-back day is still day 0", () => {
    const rows = [rowAt("p1", "Discovery", "2026-11-01T00:30:00-05:00")];
    const m = computeStatusMetrics(
      "p1",
      rows,
      new Date("2026-11-01T23:45:00-06:00")
    );
    expect(m.daysInCurrentStatus).toBe(0);
  });

  it("daysToClose uses calendar days across DST", () => {
    const rows = [
      rowAt("p1", "Sent for Review", "2026-03-01T09:00:00-06:00"),
      rowAt(
        "p1",
        "Closed Won",
        "2026-03-22T09:00:00-05:00",
        "Sent for Review"
      ),
    ];
    const m = computeStatusMetrics(
      "p1",
      rows,
      new Date("2026-04-01T12:00:00-05:00")
    );
    expect(m.daysToClose).toBe(21);
  });

  it("clamps daysInCurrentStatus to 0 under clock skew", () => {
    // changed_at is just after Chicago midnight; now is just before it.
    const rows = [rowAt("p1", "Discovery", "2026-04-22T00:00:00.500-05:00")];
    const m = computeStatusMetrics(
      "p1",
      rows,
      new Date("2026-04-21T23:59:59.900-05:00")
    );
    expect(m.daysInCurrentStatus).toBe(0);
  });

  it("unparseable changed_at yields null days and does not throw", () => {
    const rows = [
      rowAt("p1", "Sent for Review", "not-a-date"),
      rowAt("p1", "Closed Won", "also-not-a-date", "Sent for Review"),
    ];
    let m: ReturnType<typeof computeStatusMetrics> | undefined;
    expect(() => {
      m = computeStatusMetrics("p1", rows, NOW);
    }).not.toThrow();
    expect(m?.daysInCurrentStatus).toBeNull();
    expect(m?.daysToClose).toBeNull();
  });
});

describe("buildStatusMetricsMap", () => {
  it("returns one entry per distinct proposal_id", () => {
    const rows = [
      row("a", "Discovery", 10),
      row("b", "Sent for Review", 5),
      row("a", "Sent for Review", 2, "Discovery"),
    ];
    const map = buildStatusMetricsMap(rows, NOW);
    expect(map.size).toBe(2);
    expect(map.get("a")?.currentStatus).toBe("Sent for Review");
    expect(map.get("b")?.currentStatus).toBe("Sent for Review");
  });

  it("returns an empty map for zero rows", () => {
    expect(buildStatusMetricsMap([], NOW).size).toBe(0);
  });
});
