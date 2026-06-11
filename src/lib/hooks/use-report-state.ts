"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

// ─────────────────────────────────────────────────────────────
// Shared report-page state: rows / loading / hasRun plus the
// run-with-toast-on-failure pattern every report reimplemented.
// ─────────────────────────────────────────────────────────────

export function useReportState<Row>(failureMessage: string) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const run = useCallback(
    async (fetchRows: () => Promise<Row[]>) => {
      setLoading(true);
      setHasRun(true);
      try {
        setRows(await fetchRows());
      } catch (error) {
        setRows([]);
        toast.error(error instanceof Error ? error.message : failureMessage);
      } finally {
        setLoading(false);
      }
    },
    [failureMessage]
  );

  return { rows, setRows, loading, hasRun, run };
}

export type CustomerOption = { id: string; company_name: string };

/**
 * Customers dropdown data + the signed-in user id — fetched once on
 * mount, shared by every report's filter bar.
 */
export function useReportFilterData() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
    supabase
      .from("customers")
      .select("id, company_name")
      .order("company_name")
      .then(({ data }) => {
        if (data) setCustomers(data);
      });
  }, [supabase]);

  return { supabase, customers, currentUserId };
}
