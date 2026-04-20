import { describe, it, expect, vi } from "vitest";
import { fetchCustomerMap, fetchStatusHistoryMap } from "../data";
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
          new_status: "Draft",
          changed_at: "2026-04-01T00:00:00Z",
        },
        {
          proposal_id: "p1",
          old_status: "Draft",
          new_status: "Proposal Sent",
          changed_at: "2026-04-05T00:00:00Z",
        },
      ],
      error: null,
    });
    const map = await fetchStatusHistoryMap(client, ["p1"], now);
    const metrics = map.get("p1");
    expect(metrics?.currentStatus).toBe("Proposal Sent");
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
