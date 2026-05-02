"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  Grid3X3,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/use-auth";
import { useRequireManagerOrAdmin } from "@/lib/hooks/use-require-admin";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: Grid3X3 },
  { label: "Proposals", href: "/proposals", icon: FileText },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Customers", href: "/customers", icon: Users },
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  const renderNav = (mode: "desktop" | "mobile") => {
    const isCollapsed = mode === "desktop" && collapsed;
    const closeMobile = () => {
      if (mode === "mobile") setMobileOpen(false);
    };

    return (
      <>
        <nav className="flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={isCollapsed ? item.label : undefined}
                  onClick={closeMobile}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isCollapsed && "justify-center px-2",
                    pathname.startsWith(item.href)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>

          {settingsStatus.status === "loading" ? (
            <div className="mt-4 space-y-2 px-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 animate-pulse rounded-md bg-sidebar-accent/30"
                />
              ))}
            </div>
          ) : settingsItems.length > 0 && (
            <>
              <Separator className="my-4" />
              {!isCollapsed ? (
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  Settings
                </p>
              ) : (
                <div className="mb-2 flex justify-center text-sidebar-foreground/50">
                  <Settings className="size-4" />
                  <span className="sr-only">Settings</span>
                </div>
              )}
              <div className="space-y-1">
                {settingsItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? item.label : undefined}
                    onClick={closeMobile}
                    className={cn(
                      "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isCollapsed && "justify-center px-2 text-xs",
                      pathname.startsWith(item.href)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    {isCollapsed ? item.label.slice(0, 2) : item.label}
                  </Link>
                ))}
              </div>
            </>
          )}
        </nav>

        <div className="border-t p-3">
          {!isCollapsed && (
            <div className="mb-2 truncate px-3 text-sm text-sidebar-foreground/70">
              {user?.email}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full", isCollapsed ? "justify-center px-2" : "justify-start")}
            onClick={() => {
              closeMobile();
              void signOut();
            }}
          >
            {isCollapsed ? "Out" : "Sign out"}
          </Button>
        </div>
      </>
    );
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <Link href="/dashboard" className="text-base font-semibold">
          Rapid Rollout
        </Link>
        <Button
          variant="outline"
          size="icon"
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-4" />
        </Button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-black/20"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[min(20rem,85vw)] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <Link
                href="/dashboard"
                className="text-lg font-semibold"
                onClick={() => setMobileOpen(false)}
              >
                Rapid Rollout
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            {renderNav("mobile")}
          </aside>
        </div>
      )}

      <aside
        className={cn(
          "sticky top-0 hidden h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-3">
          {!collapsed && (
            <Link href="/dashboard" className="truncate text-lg font-semibold">
              Rapid Rollout
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className={cn(collapsed && "mx-auto")}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
        </div>
        {renderNav("desktop")}
      </aside>
    </>
  );
}
