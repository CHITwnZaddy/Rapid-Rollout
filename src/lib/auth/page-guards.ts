import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, isManagerOrAdminRole, type AppRole } from "./roles";

type PageUser = {
  id: string;
  role: AppRole | null;
};

async function getPageUser(): Promise<PageUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const role = user.app_metadata?.role;
  return {
    id: user.id,
    role: isManagerOrAdminRole(role) || role === "user" ? role : null,
  };
}

export async function requireAdminPage(): Promise<PageUser> {
  const user = await getPageUser();

  if (!user || !isAdminRole(user.role)) {
    redirect("/dashboard");
  }

  return user;
}

export async function requireManagerOrAdminPage(): Promise<PageUser> {
  const user = await getPageUser();

  if (!user || !isManagerOrAdminRole(user.role)) {
    redirect("/dashboard");
  }

  return user;
}
