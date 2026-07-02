"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

// Email link types Supabase can hand us via the confirm link. Anything else is
// treated as an invalid link.
const VALID_OTP_TYPES: readonly EmailOtpType[] = [
  "invite",
  "recovery",
  "email",
  "email_change",
  "signup",
  "magiclink",
];

function isEmailOtpType(value: string): value is EmailOtpType {
  return (VALID_OTP_TYPES as readonly string[]).includes(value);
}

// Verifies a Supabase email OTP and, on success, establishes the session before
// forwarding the user on. This runs from a POST (the "Continue" button), never
// on the initial GET of /auth/confirm. Corporate email security scanners
// prefetch links with GET and do not execute JS or submit forms, so the
// single-use token survives their scan and is only consumed when a human clicks.
export async function confirmEmailOtp(formData: FormData) {
  const tokenHash = formData.get("token_hash");
  const rawType = formData.get("type");
  const rawNext = formData.get("next");
  const next = sanitizeNextPath(
    typeof rawNext === "string" ? rawNext : null
  );

  let verified = false;
  if (
    typeof tokenHash === "string" &&
    typeof rawType === "string" &&
    isEmailOtpType(rawType)
  ) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: rawType,
      token_hash: tokenHash,
    });
    verified = !error;
  }

  // redirect() throws NEXT_REDIRECT, so it must run after the async work and
  // outside any try/catch.
  redirect(verified ? next : "/auth-error");
}
