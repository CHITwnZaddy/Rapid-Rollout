export const revalidate = 60;

import { requireAdminPage } from "@/lib/auth/page-guards";
import { listUsers } from "./actions";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  await requireAdminPage();

  const users = await listUsers();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Users</h1>
      <UsersClient initialUsers={users} />
    </div>
  );
}
