import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardWidgetLinkProps = {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
};

export function DashboardWidgetLink({
  href,
  className,
  title,
  children,
}: DashboardWidgetLinkProps) {
  return (
    <Link href={href} className="block h-full" title={title}>
      <Card
        className={cn(
          "h-full rounded-lg border-l-4 border-l-primary/45 transition-colors hover:bg-muted/35",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          className
        )}
      >
        {children}
      </Card>
    </Link>
  );
}
