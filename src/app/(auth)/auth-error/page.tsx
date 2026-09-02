import Link from "next/link";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// `type` is forwarded by confirmEmailOtp and is only ever one of the validated
// EmailOtpType values — never raw user input. It selects the recovery copy so a
// user whose reset link expired is told to request a new one rather than to ask
// an admin for an invite they never needed.
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const isRecovery = type === "recovery";

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Link invalid or expired</CardTitle>
        <CardDescription>
          {isRecovery
            ? "This password reset link could not be verified. It may have expired or already been used."
            : "This sign-in link could not be verified. It may have expired or already been used."}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-col gap-2">
        {isRecovery ? (
          <p className="text-sm text-muted-foreground">
            <Link href="/forgot-password" className="text-primary underline">
              Request a new reset link
            </Link>
            , or{" "}
            <Link href="/login" className="text-primary underline">
              sign in
            </Link>{" "}
            if you remembered your password.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask an admin to send a new invite, then{" "}
            <Link href="/login" className="text-primary underline">
              sign in
            </Link>
            .
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
