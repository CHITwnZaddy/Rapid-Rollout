"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Cached singleton — calling createClient() in a React component
// body (a common pattern in this app) used to return a brand new
// BrowserClient reference on every render, which meant any
// `useEffect(..., [supabase])` would re-fire on every render and
// overwrite local state with whatever was in the DB. Returning a
// stable singleton makes the reference identity stable across
// renders while still being lazy-initialized.
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null =
  null;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}
