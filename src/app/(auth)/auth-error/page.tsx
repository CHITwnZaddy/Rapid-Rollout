import Link from "next/link";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AuthErrorPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Link invalid or expired</CardTitle>
        <CardDescription>
          This sign-in link could not be verified. It may have expired or
          already been used.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Ask an admin to send a new invite, then{" "}
          <Link href="/login" className="text-primary underline">
            sign in
          </Link>
          .
        </p>
      </CardFooter>
    </Card>
  );
}
