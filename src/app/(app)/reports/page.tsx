"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const reports = [
  {
    title: "Proposal Log",
    description:
      "Summary view of all proposals with customer, scenarios, scoped services, migration services, and grand total. Filter by status.",
    href: "/reports/proposal-log",
  },
  {
    title: "Scenario Breakout",
    description:
      "Detailed breakout of a single proposal showing every module, scope, scoped service line, and migration service line with subtotals.",
    href: "/reports/scenario-breakout",
  },
  {
    title: "Time to Close",
    description:
      "Days from Proposal Sent to Won/Lost across proposals. Red rows closed in >30 days; green ≤30. Filter by customer, status, owner, and sent-date range.",
    href: "/reports/time-to-close",
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {reports.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle>{r.title}</CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">
                  Run Report &rarr;
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
