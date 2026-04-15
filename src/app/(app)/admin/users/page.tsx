// Phase 2.7 — user list changes on admin action; 60s is fine.
export const revalidate = 60;

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function UsersPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Users</h1>
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          User management requires Supabase Admin API access. Use the Supabase
          dashboard to manage users and assign roles (admin/user) via
          app_metadata.
        </CardContent>
      </Card>
    </div>
  );
}
