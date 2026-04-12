import { AppSidebar } from "@/components/layout/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
