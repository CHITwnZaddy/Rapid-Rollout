import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  SetPasswordForm,
  type SetPasswordMode,
} from "./set-password-form";

// Landing page for both invite and recovery links. /auth/confirm establishes
// the session with verifyOtp and then sends the user here; `mode` only selects
// the wording.
//
// The session check runs here rather than in the client form so there is no
// "Verifying…" flash on every load. Reading searchParams also opts this route
// into dynamic rendering, which is what we want — it is never prerenderable.
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already bounces session-less requests to /login, so this is a
  // defence-in-depth guard rather than the primary gate.
  if (!user) {
    redirect("/login");
  }

  const setPasswordMode: SetPasswordMode =
    mode === "recovery" ? "recovery" : "invite";

  return <SetPasswordForm mode={setPasswordMode} />;
}
