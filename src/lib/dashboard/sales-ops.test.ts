import { describe, expect, it } from "vitest";
import {
  calculateCountByStage,
  calculateOpenProposalValue,
  calculateOnHoldCount,
  calculateQuotaProgress,
  calculateStaleCount,
  calculateValueByStage,
  calculateVarianceRollups,
} from "./sales-ops";

const baseProposal = {
  id: "p",
  ownerId: "se-1",
  value: 0,
  soldPrice: null,
  loeValue: null,
  loeSignedDate: null,
  statusChangedAt: "2026-04-01T00:00:00Z",
};

describe("sales ops dashboard metrics", () => {
  it("counts Awaiting Sig as open pipeline but not quota progress", () => {
    const proposals = [
      { ...baseProposal, id: "p1", status: "Awaiting Sig", value: 50_000 },
      {
        ...baseProposal,
        id: "p2",
        status: "Closed Won",
        value: 100_000,
        soldPrice: 90_000,
        loeValue: 100_000,
        loeSignedDate: "2026-05-01",
      },
    ];

    expect(calculateOpenProposalValue(proposals)).toBe(50_000);
    expect(
      calculateQuotaProgress(proposals, {
        targetAmount: 200_000,
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      })
    ).toEqual({
      targetAmount: 200_000,
      closedSoldPrice: 90_000,
      percentToTarget: 45,
      remainingToTarget: 110_000,
    });
  });

  it("counts Closed Won by LoE signed date", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "in-range",
        status: "Closed Won",
        soldPrice: 100_000,
        loeValue: 100_000,
        loeSignedDate: "2026-03-31",
      },
      {
        ...baseProposal,
        id: "out-of-range",
        status: "Closed Won",
        soldPrice: 500_000,
        loeValue: 500_000,
        loeSignedDate: "2026-04-01",
      },
    ];

    expect(
      calculateQuotaProgress(proposals, {
        targetAmount: 200_000,
        dateFrom: "2026-01-01",
        dateTo: "2026-03-31",
      }).closedSoldPrice
    ).toBe(100_000);
  });

  it("groups value and count by stage", () => {
    const proposals = [
      { ...baseProposal, id: "p1", status: "Discovery", value: 10_000 },
      { ...baseProposal, id: "p2", status: "Discovery", value: 15_000 },
      { ...baseProposal, id: "p3", status: "Scoping", value: 20_000 },
      { ...baseProposal, id: "p4", status: "Closed Lost", value: 99_000 },
    ];

    expect(calculateValueByStage(proposals)).toEqual([
      { status: "Discovery", value: 25_000 },
      { status: "Scoping", value: 20_000 },
    ]);
    expect(calculateCountByStage(proposals)).toEqual([
      { status: "Discovery", count: 2 },
      { status: "Scoping", count: 1 },
    ]);
  });

  it("uses days in current status and editable thresholds for stale count", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "stale",
        status: "Discovery",
        statusChangedAt: "2026-04-01T00:00:00Z",
      },
      {
        ...baseProposal,
        id: "fresh",
        status: "Scoping",
        statusChangedAt: "2026-04-25T00:00:00Z",
      },
      {
        ...baseProposal,
        id: "hold",
        status: "On Hold",
        statusChangedAt: "2026-01-01T00:00:00Z",
      },
    ];

    expect(
      calculateStaleCount(proposals, {
        now: new Date("2026-05-01T00:00:00Z"),
        thresholds: { Discovery: 21, Scoping: 21 },
      })
    ).toBe(1);
    expect(calculateOnHoldCount(proposals)).toBe(1);
  });

  it("rolls up under, even, and over variance", () => {
    const proposals = [
      {
        ...baseProposal,
        id: "under",
        status: "Closed Won",
        soldPrice: 100_000,
        loeValue: 90_000,
      },
      {
        ...baseProposal,
        id: "even",
        status: "Closed Won",
        soldPrice: 50_000,
        loeValue: 50_000,
      },
      {
        ...baseProposal,
        id: "over",
        status: "Closed Won",
        soldPrice: 25_000,
        loeValue: 30_000,
      },
    ];

    expect(calculateVarianceRollups(proposals)).toEqual({
      underCount: 1,
      evenCount: 1,
      overCount: 1,
      netVariance: -5000,
      underVarianceTotal: -10000,
      overVarianceTotal: 5000,
    });
  });
});
