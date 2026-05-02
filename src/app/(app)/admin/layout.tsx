import { requireManagerOrAdminPage } from "@/lib/auth/page-guards";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireManagerOrAdminPage();

  return <>{children}</>;
}
