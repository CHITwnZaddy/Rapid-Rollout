"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  loadReportFilterData,
  type ReportCustomerOption,
} from "@/lib/reports/filter-data";

// ─────────────────────────────────────────────────────────────
// Shared report-page state: rows / loading / hasRun plus the
// run-with-toast-on-failure pattern every report reimplemented.
// ─────────────────────────────────────────────────────────────

export function useReportState<Row>(failureMessage: string) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fetchRows: () => Promise<Row[]>) => {
      setLoading(true);
      setHasRun(true);
      setError(null);
      try {
        setRows(await fetchRows());
      } catch (error) {
        const message = error instanceof Error ? error.message : failureMessage;
        setRows([]);
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [failureMessage]
  );

  return { rows, setRows, loading, hasRun, error, run };
}

export type CustomerOption = ReportCustomerOption;

/**
 * Customers dropdown data + the signed-in user id — fetched once on
 * mount, shared by every report's filter bar.
 */
export function useReportFilterData() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    loadReportFilterData(supabase)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setCustomers([]);
          setCurrentUserId(null);
          setError(result.error);
          return;
        }
        setError(null);
        setCustomers(result.customers);
        setCurrentUserId(result.currentUserId);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supabase, retryToken]);

  return {
    supabase,
    customers,
    currentUserId,
    loading,
    error,
    retry: () => {
      setLoading(true);
      setError(null);
      setRetryToken((token) => token + 1);
    },
  };
}
