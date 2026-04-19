"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export async function listUsers() {
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
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role },
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function updateUserRole(userId: string, role: "admin" | "user") {
  const admin = createAdminClient();
  const appMeta = role === "admin" ? { role: "admin" } : {};
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: appMeta,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}
