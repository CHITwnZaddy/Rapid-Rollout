import { assertManagerOrAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type KpiYearTarget =
  Database["public"]["Tables"]["kpi_year_targets"]["Row"];

export type KpiUserTarget =
  Database["public"]["Tables"]["kpi_user_targets"]["Row"];

export type ProposalStaleThreshold =
  Database["public"]["Tables"]["proposal_stale_thresholds"]["Row"];

export type ProposalVarianceReason =
  Database["public"]["Tables"]["proposal_variance_reasons"]["Row"];

export type SettingsUser = {
  id: string;
  email: string;
  role: string | null;
};

export async function listKpiYearTargets(): Promise<KpiYearTarget[]> {
  await assertManagerOrAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kpi_year_targets")
    .select("*")
    .order("year", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listKpiUserTargets(): Promise<KpiUserTarget[]> {
  await assertManagerOrAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kpi_user_targets")
    .select("*")
    .order("year", { ascending: true })
    .order("user_id", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listSettingsUsers(): Promise<SettingsUser[]> {
  await assertManagerOrAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers();

  if (error) throw new Error(error.message);
  return data.users.map((user) => ({
    id: user.id,
    email: user.email ?? user.id,
    role: (user.app_metadata?.role as string | undefined) ?? null,
  }));
}

export async function listStaleThresholds(): Promise<ProposalStaleThreshold[]> {
  await assertManagerOrAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposal_stale_thresholds")
    .select("*")
    .order("status", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listVarianceReasons(): Promise<ProposalVarianceReason[]> {
  await assertManagerOrAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposal_variance_reasons")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
