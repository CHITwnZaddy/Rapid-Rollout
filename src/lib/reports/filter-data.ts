import type { SupabaseClient } from "@supabase/supabase-js";

export type ReportFilterDataClient = Pick<SupabaseClient, "auth" | "from">;

export type ReportCustomerOption = {
  id: string;
  company_name: string;
};

export type ReportFilterData =
  | {
      ok: true;
      customers: ReportCustomerOption[];
      currentUserId: string | null;
    }
  | { ok: false; error: string };

type QueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
};

export async function loadReportFilterData(
  supabase: ReportFilterDataClient
): Promise<ReportFilterData> {
  const [userResult, customersResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("customers")
      .select("id, company_name")
      .order("company_name") as PromiseLike<QueryResult<ReportCustomerOption[]>>,
  ]);

  if (userResult.error) {
    return {
      ok: false,
      error: `Couldn't load report user. ${userResult.error.message}`,
    };
  }

  if (customersResult.error) {
    return {
      ok: false,
      error: `Couldn't load report customers. ${
        customersResult.error.message ?? "Unknown error."
      }`,
    };
  }

  return {
    ok: true,
    customers: customersResult.data ?? [],
    currentUserId: userResult.data.user?.id ?? null,
  };
}
