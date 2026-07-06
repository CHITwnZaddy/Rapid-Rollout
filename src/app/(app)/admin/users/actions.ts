"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin, AuthError } from "@/lib/auth/require-admin";

// Client-invoked mutations in this file return this result object instead of
// throwing, matching the contract used across the other action modules
// (proposals, customers, variance-reasons, etc.). The client checks
// `result.ok` and surfaces `result.error` in the UI.
export type ActionResult = { ok: true } | { ok: false; error: string };

// Converts a thrown error into the result contract. Known failures inside the
// actions return early with a specific message; this only handles the auth
// assert's AuthError and genuinely unexpected throwables.
function actionError(error: unknown, fallback: string): ActionResult {
  if (error instanceof AuthError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

// Zod schema for the invite payload. Email is validated before we
// hand it to Supabase so malformed input surfaces a clean error
// instead of a raw Supabase message ("A valid email address is
// required", etc.).
const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  role: z.enum(["admin", "user"]),
});

const roleSchema = z.object({
  userId: z.string().uuid("Invalid user id."),
  role: z.enum(["admin", "user"]),
});

const deleteSchema = z.object({
  userId: z.string().uuid("Invalid user id."),
});

// Read consumed by the /admin/users server component. It intentionally throws
// rather than returning a result object: a failed load should hit the route's
// error boundary, and there is no client-side handler to surface a message to.
// The result-object contract below is for the client-invoked mutations.
export async function listUsers() {
  await assertAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw new Error(error.message);
  return data.users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    role: (u.app_metadata?.role as string | undefined) ?? null,
    createdAt: u.created_at,
    lastSignIn: u.last_sign_in_at ?? null,
  }));
}

export async function inviteUser(
  email: string,
  role: "admin" | "user"
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = inviteSchema.safeParse({ email, role });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid invite payload.",
      };
    }

    const admin = createAdminClient();
    // inviteUserByEmail only accepts `data` (which maps to user_metadata) and
    // `redirectTo`. Roles MUST live in app_metadata, since that is what every
    // auth check and RLS policy reads. So we invite first, then promote the
    // returned user via updateUserById. Mirrors updateUserRole: only admins get
    // an app_metadata role; plain users are left with no role claim.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      parsed.data.email
    );
    if (error) return { ok: false, error: error.message };

    if (parsed.data.role === "admin" && data.user) {
      const { error: roleError } = await admin.auth.admin.updateUserById(
        data.user.id,
        { app_metadata: { role: "admin" } }
      );
      if (roleError) return { ok: false, error: roleError.message };
    }
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (error) {
    return actionError(error, "Unable to send the invite.");
  }
}

export async function updateUserRole(
  userId: string,
  role: "admin" | "user"
): Promise<ActionResult> {
  try {
    const caller = await assertAdmin();
    const parsed = roleSchema.safeParse({ userId, role });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid role payload.",
      };
    }

    // Guard: an admin cannot demote themselves in a single action. This
    // prevents accidental lockout if they're the only admin in the system.
    if (parsed.data.userId === caller.id && parsed.data.role !== "admin") {
      return { ok: false, error: "You cannot remove your own admin role." };
    }

    const admin = createAdminClient();
    const appMeta = parsed.data.role === "admin" ? { role: "admin" } : {};
    const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
      app_metadata: appMeta,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (error) {
    return actionError(error, "Unable to update the user's role.");
  }
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  try {
    const caller = await assertAdmin();
    const parsed = deleteSchema.safeParse({ userId });
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid user id.",
      };
    }

    // Guard: an admin cannot delete themselves.
    if (parsed.data.userId === caller.id) {
      return { ok: false, error: "You cannot delete your own account here." };
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(parsed.data.userId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (error) {
    return actionError(error, "Unable to remove the user.");
  }
}
