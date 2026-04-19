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
    const rows = [row("p1", "Draft", 0)];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.daysInCurrentStatus).toBe(0);
    expect(m.currentStatus).toBe("Draft");
  });

  it("computes firstSentAt, firstWonAt, daysToClose across a full lifecycle", () => {
    // Draft 30d ago -> Proposal Sent 20d ago -> Customer Review 10d ago -> Won 5d ago
    const rows = [
      row("p1", "Draft", 30),
      row("p1", "Proposal Sent", 20, "Draft"),
      row("p1", "Customer Review", 10, "Proposal Sent"),
      row("p1", "Won", 5, "Customer Review"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.currentStatus).toBe("Won");
    expect(m.daysInCurrentStatus).toBe(5);
    expect(m.daysToClose).toBe(15); // 20d ago → 5d ago
    expect(m.firstSentAt).not.toBeNull();
    expect(m.firstWonAt).not.toBeNull();
  });

  it("returns null daysToClose when proposal was never sent", () => {
    const rows = [row("p1", "Draft", 30), row("p1", "VOID", 5, "Draft")];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.daysToClose).toBeNull();
  });

  it("returns null daysToClose when still in-flight (never Won/Lost)", () => {
    const rows = [
      row("p1", "Draft", 30),
      row("p1", "Proposal Sent", 20, "Draft"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.daysToClose).toBeNull();
    expect(m.firstSentAt).not.toBeNull();
  });

  it("measures daysToClose to the FIRST close, even if re-opened later", () => {
    // Sent 40d ago, Won 30d ago (10d close), re-opened to Draft 20d ago,
    // Won again 5d ago. Expected: 10 — the original close.
    const rows = [
      row("p1", "Proposal Sent", 40),
      row("p1", "Won", 30, "Proposal Sent"),
      row("p1", "Draft", 20, "Won"),
      row("p1", "Proposal Sent", 15, "Draft"),
      row("p1", "Won", 5, "Proposal Sent"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.daysToClose).toBe(10);
  });

  it("sorts mixed-order rows ascending by changed_at", () => {
    const rows = [
      row("p1", "Won", 5, "Proposal Sent"),
      row("p1", "Draft", 30),
      row("p1", "Proposal Sent", 20, "Draft"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.currentStatus).toBe("Won");
    expect(m.daysToClose).toBe(15);
  });

  it("filters out rows belonging to other proposals", () => {
    const rows = [
      row("p1", "Draft", 30),
      row("p2", "Won", 1, "Draft"),
      row("p1", "Proposal Sent", 10, "Draft"),
    ];
    const m = computeStatusMetrics("p1", rows, NOW);
    expect(m.currentStatus).toBe("Proposal Sent");
    expect(m.firstWonAt).toBeNull();
  });
});

describe("buildStatusMetricsMap", () => {
  it("returns one entry per distinct proposal_id", () => {
    const rows = [
      row("a", "Draft", 10),
      row("b", "Proposal Sent", 5),
      row("a", "Proposal Sent", 2, "Draft"),
    ];
    const map = buildStatusMetricsMap(rows, NOW);
    expect(map.size).toBe(2);
    expect(map.get("a")?.currentStatus).toBe("Proposal Sent");
    expect(map.get("b")?.currentStatus).toBe("Proposal Sent");
  });

  it("returns an empty map for zero rows", () => {
    expect(buildStatusMetricsMap([], NOW).size).toBe(0);
  });
});
