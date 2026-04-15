"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "grid" },
  { label: "Proposals", href: "/proposals", icon: "file-text" },
  { label: "Customers", href: "/customers", icon: "users" },
  { label: "Reports", href: "/reports", icon: "bar-chart" },
];

const adminItems = [
  { label: "Rate Cards", href: "/admin/rate-cards" },
  { label: "Service Hours", href: "/admin/service-hours" },
  { label: "Customers", href: "/admin/customers" },
  { label: "Users", href: "/admin/users" },
  { label: "Change Log", href: "/admin/change-log" },
  { label: "Theme", href: "/admin/theme" },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, isAdmin, signOut } = useAuth();

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

        {isAdmin && (
          <>
            <Separator className="my-4" />
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              Admin
            </p>
            <div className="space-y-1">
              {adminItems.map((item) => (
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
