"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  submitRequestPasswordReset,
  type RequestPasswordResetResult,
} from "./actions";

const INITIAL: RequestPasswordResetResult = { ok: true, sent: false };

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    submitRequestPasswordReset,
    INITIAL
  );

  // The confirmation is deliberately identical whether or not an account
  // exists for the address, so the form cannot be used to enumerate users.
  if (state.ok && state.sent) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            If an account exists for that address, we&apos;ve sent a reset link.
            It may take a few minutes to arrive.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="text-primary underline">
              Back to sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a link to choose a new
          password.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {!state.ok && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              {state.error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Sending…" : "Send reset link"}
          </Button>
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="text-primary underline">
              Back to sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
