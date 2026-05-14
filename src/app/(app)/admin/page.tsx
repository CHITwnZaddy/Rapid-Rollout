export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireManagerOrAdminPage } from "@/lib/auth/page-guards";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const managerPages = [
  {
    title: "Change Log",
    description: "View audit trail of proposal and settings changes",
    href: "/admin/change-log",
  },
  {
    title: "KPI Targets",
    description: "Set yearly team quota and SE targets",
    href: "/admin/kpi-targets",
  },
  {
    title: "Stale Thresholds",
    description: "Set how long each active status can sit",
    href: "/admin/stale-thresholds",
  },
  {
    title: "Variance Reasons",
    description: "Manage final price variance reason options",
    href: "/admin/variance-reasons",
  },
];

const adminOnlyPages = [
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
  ...managerPages,
  {
    title: "Theme",
    description: "Manage local theme presets",
    href: "/admin/theme",
  },
];

export default async function AdminPage() {
  const user = await requireManagerOrAdminPage();
  const settingsPages = user.role === "admin" ? adminOnlyPages : managerPages;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {settingsPages.map((page) => (
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
