// Phase 2.7 — admin landing is just a card grid of links. Almost
// pure static; revalidate every 5 minutes is plenty.
export const revalidate = 300;

import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const adminPages = [
  {
    title: "Rate Cards",
    description: "Manage labor rates per role",
    href: "/admin/rate-cards",
  },
  {
    title: "Service Hours",
    description: "Manage effort hours by module and scope",
    href: "/admin/service-hours",
  },
  {
    title: "Customers",
    description: "Manage customer company information",
    href: "/admin/customers",
  },
  {
    title: "Users",
    description: "Manage user accounts and roles",
    href: "/admin/users",
  },
  {
    title: "Change Log",
    description: "View audit trail of changes",
    href: "/admin/change-log",
  },
];

export default function AdminPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adminPages.map((page) => (
          <Link key={page.href} href={page.href}>
            <Card className="transition-colors hover:bg-muted/30">
              <CardHeader>
                <CardTitle className="text-base">{page.title}</CardTitle>
                <CardDescription>{page.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
