import { describe, it, expect, vi } from "vitest";
import { fetchRequiredRates } from "../queries";
import type { SupabaseClient } from "@supabase/supabase-js";

function mockClient(response: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue(response),
  };
  return Object.assign({
    from: vi.fn().mockReturnValue(query),
  } as unknown as SupabaseClient, { __query: query });
}

describe("fetchRequiredRates", () => {
  it("loads only active required rate rows", async () => {
    const client = mockClient({
      data: [{ lookup_key: "Master|Business Analyst", rate: 140 }],
      error: null,
    });

    await fetchRequiredRates(client, ["Master|Business Analyst"]);

    expect(client.from).toHaveBeenCalledWith("rate_cards");
    expect(client.__query.eq).toHaveBeenCalledWith("status", "Active");
    expect(client.__query.in).toHaveBeenCalledWith("lookup_key", [
      "Master|Business Analyst",
    ]);
  });

  it("returns all rates when every required key is present", async () => {
    const client = mockClient({
      data: [
        { lookup_key: "Master|Business Analyst", rate: 140 },
        { lookup_key: "Master|Program Manager", rate: 180 },
      ],
      error: null,
    });
    const result = await fetchRequiredRates(client, [
      "Master|Business Analyst",
      "Master|Program Manager",
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rates.get("Master|Business Analyst")).toBe(140);
      expect(result.rates.get("Master|Program Manager")).toBe(180);
    }
  });

  it("fails closed when a required key is missing from the response", async () => {
    const client = mockClient({
      data: [{ lookup_key: "Master|Business Analyst", rate: 140 }],
      error: null,
    });
    const result = await fetchRequiredRates(client, [
      "Master|Business Analyst",
      "Master|Program Manager",
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Master|Program Manager");
    }
  });

  it("fails closed when Supabase returns an error", async () => {
    const client = mockClient({
      data: null,
      error: { message: "connection refused" },
    });
    const result = await fetchRequiredRates(client, ["Master|Business Analyst"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("connection refused");
    }
  });

  it("coerces non-numeric rate values through NUM (defensive)", async () => {
    const client = mockClient({
      data: [{ lookup_key: "Master|Foo", rate: "275" }],
      error: null,
    });
    const result = await fetchRequiredRates(client, ["Master|Foo"]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rates.get("Master|Foo")).toBe(275);
  });

  it("fails closed when a required rate is zero", async () => {
    const client = mockClient({
      data: [{ lookup_key: "Master|Business Analyst", rate: 0 }],
      error: null,
    });
    const result = await fetchRequiredRates(client, ["Master|Business Analyst"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Master|Business Analyst");
    }
  });
});
