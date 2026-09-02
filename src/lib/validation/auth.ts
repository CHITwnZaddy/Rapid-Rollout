import { z } from "zod";

// Password rules for the invite, recovery, and signed-in change flows.
//
// This lived as a client-only `MIN_PASSWORD_LENGTH` constant in the
// set-password page and was enforced nowhere on the server. Sharing it here
// means the same rule runs in the browser and again inside the server action,
// and that the two new password forms don't each grow their own copy.
//
// Keep MIN_PASSWORD_LENGTH aligned with the Supabase dashboard's own minimum
// (Authentication -> Providers -> Email). If Supabase's is higher, its raw
// error reaches the user instead of ours.
export const MIN_PASSWORD_LENGTH = 8;

// Supabase hashes with bcrypt, which silently truncates past 72 bytes.
// Rejecting here produces a clear message instead of a password that appears
// to work but ignores its tail.
const MAX_PASSWORD_LENGTH = 72;

export const emailSchema = z
  .string({ error: "Email must be text" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Please enter a valid email address."));

export const passwordSchema = z
  .string({ error: "Password must be text" })
  .min(
    MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  )
  .max(
    MAX_PASSWORD_LENGTH,
    `Password cannot exceed ${MAX_PASSWORD_LENGTH} characters.`
  );

export const requestPasswordResetSchema = z.object({ email: emailSchema });

// Invite and recovery: the user has a session but does not know (or has
// forgotten) their old password, so only the new one is collected.
export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

// Signed-in change: the current password is required so a hijacked session
// alone cannot lock the real owner out. Supabase validates it server-side via
// `current_password`; this schema only checks that something was supplied.
export const changePasswordSchema = newPasswordSchema.safeExtend({
  currentPassword: z.string().min(1, "Enter your current password."),
});

export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
