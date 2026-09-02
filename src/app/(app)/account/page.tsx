import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware is the primary gate for (app) routes; this is defence in depth.
  if (!user) {
    redirect("/login");
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Account</h1>
      <p className="mb-6 text-sm text-muted-foreground">{user.email}</p>
      <div className="max-w-md">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
