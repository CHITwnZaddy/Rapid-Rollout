"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Results wrapper shared by all reports: count headline + empty state.
export function ReportResultsCard({
  count,
  noun = "proposal",
  titleSuffix,
  emptyMessage,
  errorMessage,
  children,
}: {
  count: number;
  noun?: string;
  titleSuffix?: string;
  emptyMessage: string;
  errorMessage?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Results ({count} {noun}
          {count !== 1 ? "s" : ""})
          {titleSuffix ? ` — ${titleSuffix}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {errorMessage ? (
          <p className="py-8 text-center text-sm text-destructive">
            {errorMessage}
          </p>
        ) : count === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
