"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { sanitizeNextPath, withParam } from "@/lib/auth/safe-redirect";
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

  // Narrowed to a known OTP type, or null. Only a validated value is ever
  // reflected back into the error page's query string.
  const otpType =
    typeof rawType === "string" && isEmailOtpType(rawType) ? rawType : null;

  let verified = false;
  if (typeof tokenHash === "string" && otpType) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash,
    });
    verified = !error;
  }

  // The recovery mode is derived here rather than defaulted in the confirm
  // page, so it holds whether or not the email template supplies `next`. The
  // templates are edited in the Supabase dashboard, outside this repo — a
  // Recovery template copied from the invite one would carry
  // `next=/set-password` and silently land the user on invite copy.
  const destination =
    otpType === "recovery" ? withParam(next, "mode", "recovery") : next;

  // Carry the type through so /auth-error can tell someone whose reset link
  // expired to request a new one, rather than to ask an admin for an invite.
  const failure = otpType
    ? withParam("/auth-error", "type", otpType)
    : "/auth-error";

  // redirect() throws NEXT_REDIRECT, so it must run after the async work and
  // outside any try/catch.
  redirect(verified ? destination : failure);
}
