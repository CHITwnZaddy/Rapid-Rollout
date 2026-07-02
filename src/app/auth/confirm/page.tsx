import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { confirmEmailOtp } from "./actions";

// Interstitial confirmation page for Supabase email links (invite, recovery,
// etc.). It deliberately does NOT verify the token on GET. Verification only
// happens when the user clicks "Continue", which POSTs to the confirmEmailOtp
// server action. This defeats corporate email link scanners (Safe Links,
// Mimecast, etc.) that prefetch links with a GET and would otherwise consume
// the single-use token before the human ever clicks — the cause of the
// "otp_expired / Email link is invalid or has expired" error.
//
// The Supabase email templates must link here, e.g.:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/set-password
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
  }>;
}) {
  const { token_hash: tokenHash, type, next } = await searchParams;

  if (!tokenHash || !type) {
    redirect("/auth-error");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md px-4">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Confirm your account</CardTitle>
            <CardDescription>
              Click continue to verify your invite and finish setting up your
              account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={confirmEmailOtp}>
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <input
                type="hidden"
                name="next"
                value={next ?? "/set-password"}
              />
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
