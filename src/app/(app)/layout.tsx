import { AppSidebar } from "@/components/layout/app-sidebar";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background md:flex">
      <AppSidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
