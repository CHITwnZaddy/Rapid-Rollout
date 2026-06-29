import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

// Server-side verification endpoint for Supabase email links (invite,
// recovery, email change, signup confirm). We use verifyOtp with the
// token_hash rather than a PKCE code exchange: an invite is opened in a
// different browser than the one that started the flow, so no PKCE code
// verifier cookie exists. verifyOtp works without one.
//
// On success the SSR client writes the session cookies and we forward the
// user to `next` (the invite email template points this at /set-password).
// The Supabase email templates must link here, e.g.:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/set-password
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = sanitizeNextPath(searchParams.get("next"));

  let verified = false;
  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    verified = !error;
  }

  // redirect() throws NEXT_REDIRECT, so it must be called outside any
  // try/catch and after the async work completes.
  redirect(verified ? next : "/auth-error");
}
