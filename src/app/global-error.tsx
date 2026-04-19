"use client";

import { useEffect, useState } from "react";
import { generateReferenceCode } from "@/lib/errors/reference-code";

type ErrorWithDigest = Error & { digest?: string };

// Catastrophic fallback — replaces the root layout when it itself
// throws. Must include its own <html> and <body> because the root
// layout may have errored. Intentionally uses inline styles (not
// Tailwind) so it renders even if the CSS build failed.
export default function GlobalError({
  error,
  reset,
}: {
  error: ErrorWithDigest;
  reset: () => void;
}) {
  const [refCode] = useState(generateReferenceCode);

  useEffect(() => {
    console.error("[GlobalError]", {
      refCode,
      digest: error.digest,
      message: error.message,
      stack: error.stack,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      at: new Date().toISOString(),
    });
  }, [error, refCode]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          margin: 0,
          padding: "1rem",
          backgroundColor: "#f8fafc",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            padding: "1.5rem",
            backgroundColor: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: "1.25rem" }}>
            Rapid Rollout is temporarily unavailable
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#475569" }}>
            The app hit an error it couldn&apos;t recover from. This has
            been logged. If this persists, send the reference code below
            to your admin.
          </p>
          <div
            style={{
              backgroundColor: "#f1f5f9",
              padding: "0.75rem",
              borderRadius: "0.375rem",
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.75rem",
              margin: "1rem 0",
            }}
          >
            <div>
              Reference code: <strong>{refCode}</strong>
            </div>
            {error.digest && (
              <div style={{ color: "#64748b" }}>
                Digest: {error.digest}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#0f172a",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
