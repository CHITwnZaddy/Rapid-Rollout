"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedResult } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema } from "@/lib/validation/auth";

// `changed` distinguishes the useActionState initial state from a completed
// change, since both are ok: true.
export type ChangePasswordResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: string };

// Supabase's errors here are specific enough to be worth not repeating back —
// e.g. "New password should be different from the old password" confirms a
// guessed current password to anyone holding a stolen session.
const GENERIC_FAILURE =
  "Could not update your password. Check your current password and try again.";

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function changePassword(
  formData: FormData
): Promise<ChangePasswordResult> {
  // Auth first: this is the most sensitive action in the app, and server
  // actions are directly-callable RPC endpoints, so nothing should run for an
  // unverified caller. See the doctrine comment in @/lib/auth/require-admin.
  const auth = await requireAuthenticatedResult(
    "You must be signed in to change your password."
  );
  if (!auth.ok) return auth;

  const parsed = changePasswordSchema.safeParse({
    currentPassword: getString(formData, "currentPassword"),
    password: getString(formData, "password"),
    confirmPassword: getString(formData, "confirmPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Invalid password change request.",
    };
  }

  const supabase = await createClient();

  // GoTrue validates `current_password` when "Require current password when
  // changing password" is enabled (Supabase dashboard -> Authentication ->
  // Providers -> Email). That toggle MUST be on in every environment: with it
  // off the field is ignored and anyone holding a session could change the
  // password without knowing the old one.
  //
  // Note the snake_case spelling — it is the only one the installed
  // @supabase/auth-js exposes, despite some docs prose saying currentPassword.
  //
  // Deliberately NOT verified by calling signInWithPassword first: on success
  // that rewrites the auth cookies with a new refresh-token family, orphaning
  // the caller's existing session.
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    current_password: parsed.data.currentPassword,
  });

  if (error) {
    console.error("Password change failed", error.message);
    return { ok: false, error: GENERIC_FAILURE };
  }

  // Revoke every other session so a stolen one cannot outlive the change.
  // Whether GoTrue does this by default is undocumented; "others" keeps the
  // caller signed in while making the rest deterministic. A failure here is
  // logged but does not fail the change, which has already succeeded.
  const { error: signOutError } = await supabase.auth.signOut({
    scope: "others",
  });
  if (signOutError) {
    console.error(
      "Could not revoke other sessions after password change",
      signOutError.message
    );
  }

  revalidatePath("/account");
  return { ok: true, changed: true };
}

export async function submitChangePassword(
  _prevState: ChangePasswordResult,
  formData: FormData
): Promise<ChangePasswordResult> {
  return changePassword(formData);
}
