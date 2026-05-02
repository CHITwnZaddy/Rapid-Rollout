"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/use-auth";
import { useRequireManagerOrAdmin } from "@/lib/hooks/use-require-admin";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "grid" },
  { label: "Proposals", href: "/proposals", icon: "file-text" },
  { label: "Reports", href: "/reports", icon: "bar-chart" },
  { label: "Customers", href: "/customers", icon: "users" },
];

const managerSettingsItems = [
  { label: "Change Log", href: "/admin/change-log" },
  { label: "KPI Targets", href: "/admin/kpi-targets" },
  { label: "Stale Thresholds", href: "/admin/stale-thresholds" },
  { label: "Variance Reasons", href: "/admin/variance-reasons" },
];

const adminSettingsItems = [
  { label: "Customers", href: "/admin/customers" },
  { label: "Rate Cards", href: "/admin/rate-cards" },
  { label: "Service Hours", href: "/admin/service-hours" },
  { label: "Users", href: "/admin/users" },
  { label: "Change Log", href: "/admin/change-log" },
  { label: "KPI Targets", href: "/admin/kpi-targets" },
  { label: "Stale Thresholds", href: "/admin/stale-thresholds" },
  { label: "Variance Reasons", href: "/admin/variance-reasons" },
  { label: "Theme", href: "/admin/theme" },
];

export function AppSidebar() {
  const pathname = usePathname();
  // useAuth() is used only for user/signOut here. Role-gated UI goes through
  // the discriminated hook so loading does not flash the wrong section.
  const { user, signOut } = useAuth();
  const settingsStatus = useRequireManagerOrAdmin();
  const settingsItems =
    settingsStatus.status === "admin"
      ? adminSettingsItems
      : settingsStatus.status === "manager"
        ? managerSettingsItems
        : [];

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="text-lg font-semibold">
          Rapid Rollout
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(item.href)
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {settingsStatus.status === "loading" ? (
          <div className="mt-4 space-y-2 px-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 rounded-md bg-sidebar-accent/30 animate-pulse" />
            ))}
          </div>
        ) : settingsItems.length > 0 && (
          <>
            <Separator className="my-4" />
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              Settings
            </p>
            <div className="space-y-1">
              {settingsItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    pathname.startsWith(item.href)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </nav>

      <div className="border-t p-3">
        <div className="mb-2 truncate px-3 text-sm text-sidebar-foreground/70">
          {user?.email}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={signOut}
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}
