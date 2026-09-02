"use server";

import { createClient } from "@/lib/supabase/server";
import { requestPasswordResetSchema } from "@/lib/validation/auth";

// The usual { ok, error } contract, plus `sent` so the form can tell "not
// submitted yet" from "submitted successfully" — both of which are ok: true.
// The admin row forms get away with a bare { ok: true } initial state because
// they render nothing on success; this one shows a confirmation message.
export type RequestPasswordResetResult =
  | { ok: true; sent: boolean }
  | { ok: false; error: string };

export async function requestPasswordReset(
  formData: FormData
): Promise<RequestPasswordResetResult> {
  const rawEmail = formData.get("email");
  const parsed = requestPasswordResetSchema.safeParse({
    email: typeof rawEmail === "string" ? rawEmail : "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Please enter a valid email address.",
    };
  }

  const supabase = await createClient();

  // No second argument on purpose. Passing `redirectTo` populates GoTrue's
  // {{ .RedirectTo }} and requires the URL on the project's Redirect URL
  // allowlist. The Recovery template uses {{ .SiteURL }} + {{ .TokenHash }}
  // instead, so redirectTo would be dead weight and extra config. Using
  // {{ .RedirectTo }} in the template would be worse still: it renders an
  // absolute URL, which sanitizeNextPath rejects, silently landing the user on
  // /dashboard instead of the password form.
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email
  );

  if (error) {
    // Deliberately swallowed. Returning the failure would let this endpoint be
    // used to enumerate which addresses have accounts, and would surface
    // Supabase's shared-sender rate-limit error as a scary message when the
    // user can do nothing but wait. Logged server-side so real delivery
    // problems are still diagnosable.
    console.error("Password reset request failed", error.message);
  }

  // Always ok. This is load-bearing, not decorative — do not "clean it up"
  // into passing the error through.
  return { ok: true, sent: true };
}

// useActionState binding, matching the submitXxx convention used by the admin
// form actions.
export async function submitRequestPasswordReset(
  _prevState: RequestPasswordResetResult,
  formData: FormData
): Promise<RequestPasswordResetResult> {
  return requestPasswordReset(formData);
}
