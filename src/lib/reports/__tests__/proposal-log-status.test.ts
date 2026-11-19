import { describe, it, expect } from "vitest";
import { OPEN_PROPOSAL_STATUSES } from "@/lib/proposals/status";
import {
  ALL_STATUSES,
  OPEN_STATUSES,
  initialStatusSelection,
  shouldAutoRunOnArrival,
  statusFilterForSelection,
  statusFilterOptions,
  statusSelectionLabel,
} from "../proposal-log-status";

describe("initialStatusSelection", () => {
  it("maps a missing, empty or 'All' param to 'All'", () => {
    expect(initialStatusSelection(null)).toBe(ALL_STATUSES);
    expect(initialStatusSelection("")).toBe("All");
    expect(initialStatusSelection("All")).toBe("All");
  });

  it("keeps 'open' and single known statuses", () => {
    expect(initialStatusSelection("open")).toBe(OPEN_STATUSES);
    expect(initialStatusSelection("On Hold")).toBe("On Hold");
  });

  it("trims a comma list and drops unknown statuses", () => {
    expect(initialStatusSelection("Scoping, Bogus ,Negotiations")).toBe(
      "Scoping,Negotiations"
    );
    expect(initialStatusSelection("Bogus")).toBe("All");
    expect(initialStatusSelection("Bogus,Scoping")).toBe("Scoping");
  });
});

describe("statusFilterForSelection", () => {
  it("'All' applies no status filter", () => {
    expect(statusFilterForSelection("All")).toEqual({});
  });

  it("'open' filters to every open status, including On Hold", () => {
    const filter = statusFilterForSelection("open");
    expect(filter).toEqual({ statuses: [...OPEN_PROPOSAL_STATUSES] });
    expect(filter.statuses).toHaveLength(7);
    expect(filter.statuses).toContain("On Hold");
    expect(filter.status).toBeUndefined();
  });

  it("one status uses `status`, several use `statuses`", () => {
    expect(statusFilterForSelection("Closed Won")).toEqual({
      status: "Closed Won",
    });
    expect(statusFilterForSelection("Scoping,Negotiations")).toEqual({
      statuses: ["Scoping", "Negotiations"],
    });
  });

  it("dropdown overrides arrival preset", () => {
    // Arrival via ?status=On Hold seeds the dropdown...
    let selection = initialStatusSelection("On Hold");
    expect(statusFilterForSelection(selection)).toEqual({ status: "On Hold" });
    // ...then the user picks another status: the query follows the dropdown.
    selection = "Closed Won";
    expect(statusFilterForSelection(selection)).toEqual({
      status: "Closed Won",
    });
    // ...and "All" clears the status filter entirely.
    selection = "All";
    expect(statusFilterForSelection(selection)).toEqual({});
  });
});

describe("statusSelectionLabel", () => {
  it("labels All, open and comma lists", () => {
    expect(statusSelectionLabel("All")).toBe("All Statuses");
    expect(statusSelectionLabel("open")).toBe("All Open Statuses");
    expect(statusSelectionLabel("Scoping,Negotiations")).toBe(
      "Scoping, Negotiations"
    );
  });
});

describe("statusFilterOptions", () => {
  it("adds the 'open' preset as an option right after 'All'", () => {
    const options = statusFilterOptions("open");
    expect(options[0]).toEqual({ label: "All", value: "All" });
    expect(options[1]).toEqual({ label: "All Open Statuses", value: "open" });
  });

  it("adds a comma-list preset as its own option", () => {
    const options = statusFilterOptions("Scoping,Negotiations");
    expect(options[1]).toEqual({
      label: "Scoping, Negotiations",
      value: "Scoping,Negotiations",
    });
    expect(options).toHaveLength(11);
  });

  it("a single-status preset adds no extra option", () => {
    const options = statusFilterOptions("On Hold");
    expect(options.map((o) => o.value)).not.toContain("open");
    expect(options).toHaveLength(10);
  });

  it("'All' gives All plus every proposal status", () => {
    const options = statusFilterOptions("All");
    expect(options).toHaveLength(10);
    expect(options[0]).toEqual({ label: "All", value: "All" });
  });
});

describe("shouldAutoRunOnArrival", () => {
  const base = {
    searchParamString: "status=open&scope=team&from=dashboard",
    lastAutoRunKey: null,
    filtersLoading: false,
    filterError: null,
    scopePreset: "team",
    currentUserId: "u1",
  };

  it("runs once on arrival", () => {
    expect(shouldAutoRunOnArrival(base)).toBe(true);
  });

  it("no re-run for the same URL after a dropdown change", () => {
    expect(
      shouldAutoRunOnArrival({
        ...base,
        lastAutoRunKey: base.searchParamString,
      })
    ).toBe(false);
  });

  it("runs again when the URL changes", () => {
    expect(
      shouldAutoRunOnArrival({
        ...base,
        lastAutoRunKey: base.searchParamString,
        searchParamString: "status=On+Hold&scope=team&from=dashboard",
      })
    ).toBe(true);
  });

  it("waits for filter data and user id", () => {
    expect(shouldAutoRunOnArrival({ ...base, searchParamString: "" })).toBe(
      false
    );
    expect(shouldAutoRunOnArrival({ ...base, filtersLoading: true })).toBe(
      false
    );
    expect(
      shouldAutoRunOnArrival({ ...base, filterError: "Failed to load" })
    ).toBe(false);
    expect(
      shouldAutoRunOnArrival({
        ...base,
        scopePreset: "mine",
        currentUserId: null,
      })
    ).toBe(false);
    expect(
      shouldAutoRunOnArrival({ ...base, scopePreset: "mine" })
    ).toBe(true);
  });
});
