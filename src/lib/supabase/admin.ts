import { createClient } from "@supabase/supabase-js";
import { getRequiredEnv } from "@/lib/env";
import type { Database } from "@/types/database";

// Service-role client — bypasses RLS. NEVER import in client components.
export function createAdminClient() {
  const supabaseUrl = getRequiredEnv(
    process.env,
    "NEXT_PUBLIC_SUPABASE_URL"
  );
  const serviceRoleKey = getRequiredEnv(
    process.env,
    "SUPABASE_SERVICE_ROLE_KEY"
  );

  return createClient<Database>(
    supabaseUrl,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
