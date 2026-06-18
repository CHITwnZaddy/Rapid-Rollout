import { describe, expect, it, vi } from "vitest";
import {
  loadReportFilterData,
  type ReportFilterDataClient,
} from "../filter-data";

type MockResponse = {
  data: unknown;
  error: { message: string } | null;
};

function mockClient({
  auth = { data: { user: { id: "user-1" } }, error: null },
  customers = { data: [], error: null },
}: {
  auth?: MockResponse;
  customers?: MockResponse;
} = {}) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(async () => customers),
  };
  const client = {
    auth: {
      getUser: vi.fn(async () => auth),
    },
    from: vi.fn(() => query),
  };
  return {
    client: client as unknown as ReportFilterDataClient,
    query,
  };
}

describe("loadReportFilterData", () => {
  it("returns auth errors instead of treating the user as unknown", async () => {
    const { client } = mockClient({
      auth: {
        data: { user: null },
        error: { message: "invalid JWT" },
      },
    });

    await expect(loadReportFilterData(client)).resolves.toEqual({
      ok: false,
      error: "Couldn't load report user. invalid JWT",
    });
  });

  it("returns customer query errors instead of empty filters", async () => {
    const { client } = mockClient({
      customers: {
        data: null,
        error: { message: "permission denied" },
      },
    });

    await expect(loadReportFilterData(client)).resolves.toEqual({
      ok: false,
      error: "Couldn't load report customers. permission denied",
    });
  });

  it("loads customers and current user id", async () => {
    const { client, query } = mockClient({
      customers: {
        data: [
          { id: "c1", company_name: "Acme" },
          { id: "c2", company_name: "Initech" },
        ],
        error: null,
      },
    });

    const result = await loadReportFilterData(client);

    expect(client.from).toHaveBeenCalledWith("customers");
    expect(query.select).toHaveBeenCalledWith("id, company_name");
    expect(query.order).toHaveBeenCalledWith("company_name");
    expect(result).toEqual({
      ok: true,
      customers: [
        { id: "c1", company_name: "Acme" },
        { id: "c2", company_name: "Initech" },
      ],
      currentUserId: "user-1",
    });
  });
});
