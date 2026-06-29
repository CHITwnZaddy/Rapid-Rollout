"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/auth/require-admin";

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

export async function inviteUser(email: string, role: "admin" | "user") {
  await assertAdmin();
  const parsed = inviteSchema.safeParse({ email, role });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid invite payload.");
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
  if (error) throw new Error(error.message);

  if (parsed.data.role === "admin" && data.user) {
    const { error: roleError } = await admin.auth.admin.updateUserById(
      data.user.id,
      { app_metadata: { role: "admin" } }
    );
    if (roleError) throw new Error(roleError.message);
  }
  revalidatePath("/admin/users");
}

export async function updateUserRole(userId: string, role: "admin" | "user") {
  const caller = await assertAdmin();
  const parsed = roleSchema.safeParse({ userId, role });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid role payload.");
  }

  // Guard: an admin cannot demote themselves in a single action. This
  // prevents accidental lockout if they're the only admin in the system.
  if (parsed.data.userId === caller.id && parsed.data.role !== "admin") {
    throw new Error("You cannot remove your own admin role.");
  }

  const admin = createAdminClient();
  const appMeta = parsed.data.role === "admin" ? { role: "admin" } : {};
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    app_metadata: appMeta,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  const caller = await assertAdmin();
  const parsed = deleteSchema.safeParse({ userId });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid user id.");
  }

  // Guard: an admin cannot delete themselves.
  if (parsed.data.userId === caller.id) {
    throw new Error("You cannot delete your own account here.");
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(parsed.data.userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}
