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
  titleSuffix,
  emptyMessage,
  children,
}: {
  count: number;
  titleSuffix?: string;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Results ({count} proposal{count !== 1 ? "s" : ""})
          {titleSuffix ? ` — ${titleSuffix}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
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
