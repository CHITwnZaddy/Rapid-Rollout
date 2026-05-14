import { describe, expect, it } from "vitest";
import {
  calculateVariance,
  requiresUnderVarianceReason,
  validateClosedLostCloseout,
  validateClosedWonCloseout,
} from "./closeout";

describe("proposal closeout validation", () => {
  it("calculates signed LoE variance against sold price", () => {
    expect(calculateVariance(100_000, 95_000)).toEqual({
      amount: -5000,
      direction: "under",
    });
    expect(calculateVariance(100_000, 100_000)).toEqual({
      amount: 0,
      direction: "even",
    });
    expect(calculateVariance(100_000, 105_000)).toEqual({
      amount: 5000,
      direction: "over",
    });
  });

  it("requires LoE signed date for Closed Won", () => {
    const result = validateClosedWonCloseout({
      soldPrice: 100_000,
      loeValue: 100_000,
      loeSignedDate: "",
      varianceReasonCode: "",
      varianceNote: "",
    });

    expect(result).toEqual({
      ok: false,
      error: "LoE signed date is required for Closed Won.",
    });
  });

  it("requires reason and note when Signed LoE value is under sold price", () => {
    expect(requiresUnderVarianceReason(100_000, 99_999)).toBe(true);

    const missingReason = validateClosedWonCloseout({
      soldPrice: 100_000,
      loeValue: 99_999,
      loeSignedDate: "2026-05-01",
      varianceReasonCode: "",
      varianceNote: "Sr. AE discounted this before signature.",
    });

    expect(missingReason).toEqual({
      ok: false,
      error: "Variance reason is required when LoE value is under sold price.",
    });

    const missingNote = validateClosedWonCloseout({
      soldPrice: 100_000,
      loeValue: 99_999,
      loeSignedDate: "2026-05-01",
      varianceReasonCode: "ae_discount",
      varianceNote: "too short",
    });

    expect(missingNote).toEqual({
      ok: false,
      error: "Variance note must be at least 10 characters.",
    });
  });

  it("does not require variance reason or note when variance is equal", () => {
    const result = validateClosedWonCloseout({
      soldPrice: 100_000,
      loeValue: 100_000,
      loeSignedDate: "2026-05-01",
      varianceReasonCode: "",
      varianceNote: "",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        soldPrice: 100_000,
        loeValue: 100_000,
        loeSignedDate: "2026-05-01",
        varianceReasonCode: null,
        varianceNote: null,
        varianceAmount: 0,
      },
    });
  });

  it("does not require variance reason or note when variance is positive", () => {
    const result = validateClosedWonCloseout({
      soldPrice: 100_000,
      loeValue: 101_000,
      loeSignedDate: "2026-05-01",
      varianceReasonCode: "",
      varianceNote: "",
    });

    expect(result.ok).toBe(true);
  });

  it("requires reason and note for Closed Lost", () => {
    expect(
      validateClosedLostCloseout({ closedLostReason: "", closedLostNote: "" })
    ).toEqual({
      ok: false,
      error: "Closed Lost reason is required.",
    });

    expect(
      validateClosedLostCloseout({
        closedLostReason: "client_cancelled",
        closedLostNote: "short",
      })
    ).toEqual({
      ok: false,
      error: "Closed Lost note must be at least 10 characters.",
    });
  });

  it("trims notes when valid", () => {
    expect(
      validateClosedLostCloseout({
        closedLostReason: "budget",
        closedLostNote: "  Client lost funding.  ",
      })
    ).toEqual({
      ok: true,
      data: {
        closedLostReason: "budget",
        closedLostNote: "Client lost funding.",
      },
    });
  });
});
