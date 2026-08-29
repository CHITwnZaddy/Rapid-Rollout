import { ForgotPasswordForm } from "./forgot-password-form";

// Public route — listed in @/lib/auth/public-paths so middleware lets a
// session-less visitor through.
export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
