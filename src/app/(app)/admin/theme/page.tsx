import { requireAdminPage } from "@/lib/auth/page-guards";
import { ThemeClient } from "./theme-client";

export default async function ThemePage() {
  await requireAdminPage();

  return <ThemeClient />;
}
