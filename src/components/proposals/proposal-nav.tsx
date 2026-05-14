"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getScenarioDisplayName, SCENARIO_ORDER } from "@/lib/scenarios/display";

const tabs = [
  { label: "Summary", href: "" },
  { label: "Bid Sheet", href: "/bid-sheet" },
  ...SCENARIO_ORDER.map((scenarioType) => ({
    label: getScenarioDisplayName(scenarioType),
    href: `/scenarios/${scenarioType}`,
  })),
  { label: "Scoped Services", href: "/scoped-services" },
  { label: "Migration Services", href: "/migration" },
];

export function ProposalNav({ proposalId }: { proposalId: string }) {
  const pathname = usePathname();
  const basePath = `/proposals/${proposalId}`;

  return (
    <div className="mt-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const href = `${basePath}${tab.href}`;
        const isActive =
          tab.href === ""
            ? pathname === basePath
            : pathname.startsWith(href);

        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
