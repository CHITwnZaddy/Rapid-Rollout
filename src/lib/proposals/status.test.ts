import { describe, expect, it } from "vitest";
import {
  CLOSED_PROPOSAL_STATUSES,
  OPEN_PROPOSAL_STATUSES,
  STALE_TRACKED_STATUSES,
  getStatusBucket,
  isClosedProposalStatus,
  isOpenProposalStatus,
  isStaleTrackedStatus,
} from "./status";

describe("proposal status helpers", () => {
  it("classifies open proposal statuses", () => {
    expect(OPEN_PROPOSAL_STATUSES).toEqual([
      "Discovery",
      "Scoping",
      "Proposal Draft",
      "Sent for Review",
      "Negotiations",
      "Awaiting Sig",
      "On Hold",
    ]);

    expect(isOpenProposalStatus("Awaiting Sig")).toBe(true);
    expect(isOpenProposalStatus("Closed Won")).toBe(false);
  });

  it("classifies closed proposal statuses", () => {
    expect(CLOSED_PROPOSAL_STATUSES).toEqual(["Closed Won", "Closed Lost"]);
    expect(isClosedProposalStatus("Closed Won")).toBe(true);
    expect(isClosedProposalStatus("Closed Lost")).toBe(true);
    expect(isClosedProposalStatus("VOID")).toBe(false);
  });

  it("tracks stale only for active pipeline statuses", () => {
    expect(STALE_TRACKED_STATUSES).toEqual([
      "Discovery",
      "Scoping",
      "Proposal Draft",
      "Sent for Review",
      "Negotiations",
      "Awaiting Sig",
    ]);

    expect(isStaleTrackedStatus("Discovery")).toBe(true);
    expect(isStaleTrackedStatus("On Hold")).toBe(false);
    expect(isStaleTrackedStatus("Closed Lost")).toBe(false);
  });

  it("returns buckets for dashboard grouping", () => {
    expect(getStatusBucket("Discovery")).toBe("open");
    expect(getStatusBucket("On Hold")).toBe("hold");
    expect(getStatusBucket("Closed Won")).toBe("closed");
    expect(getStatusBucket("Bogus")).toBe("unknown");
  });
});
