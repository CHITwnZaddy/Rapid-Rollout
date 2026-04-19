"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateReferenceCode } from "@/lib/errors/reference-code";

type ErrorWithDigest = Error & { digest?: string };

export default function AppError({
  error,
  reset,
}: {
  error: ErrorWithDigest;
  reset: () => void;
}) {
  const [refCode] = useState(generateReferenceCode);

  useEffect(() => {
    // Structured log on the server/browser side — Vercel captures
    // console output. An SE reads the ref code to Austin; Austin
    // searches Vercel Functions logs for the same string.
    console.error("[AppError]", {
      refCode,
      digest: error.digest,
      message: error.message,
      stack: error.stack,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      at: new Date().toISOString(),
    });
  }, [error, refCode]);

  return (
    <Card className="mx-auto mt-8 max-w-xl">
      <CardHeader>
        <CardTitle>Something went wrong</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>
          The page couldn&apos;t load. This has been logged. If you
          keep hitting this, send the reference code below to your
          admin.
        </p>

        <div className="rounded-md border bg-muted/50 p-3 font-mono text-xs">
          <div>
            Reference code:{" "}
            <span className="font-semibold">{refCode}</span>
          </div>
          {error.digest && (
            <div className="text-muted-foreground">
              Digest: {error.digest}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Back to dashboard
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
