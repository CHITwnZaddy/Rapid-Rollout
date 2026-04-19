"use client";

import { useState, useTransition } from "react";
import { inviteUser, updateUserRole, deleteUser } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type User = {
  id: string;
  email: string;
  role: string | null;
  createdAt: string;
  lastSignIn: string | null;
};

export function UsersClient({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "user">("user");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await inviteUser(inviteEmail.trim(), inviteRole);
        setInviteEmail("");
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleRoleChange(userId: string, role: "admin" | "user") {
    startTransition(async () => {
      try {
        await updateUserRole(userId, role);
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: role === "user" ? null : role } : u))
        );
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleDelete(userId: string) {
    startTransition(async () => {
      try {
        await deleteUser(userId);
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="flex items-end gap-3 rounded-md border p-4">
        <div className="flex-1 space-y-1">
          <label className="text-sm font-medium">Email address</label>
          <Input
            type="email"
            placeholder="se@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          />
        </div>
        <div className="w-36 space-y-1">
          <label className="text-sm font-medium">Role</label>
          <Select
            value={inviteRole}
            onValueChange={(v) => setInviteRole(v as "admin" | "user")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">User (SE)</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleInvite} disabled={isPending || !inviteEmail.trim()}>
          Send Invite
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* User table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="w-[120px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>
                  <Select
                    value={user.role === "admin" ? "admin" : "user"}
                    onValueChange={(v) =>
                      handleRoleChange(user.id, v as "admin" | "user")
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(user.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.lastSignIn
                    ? new Date(user.lastSignIn).toLocaleDateString()
                    : "—"}
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" />
                      }
                    >
                      Remove
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove user?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes <strong>{user.email}</strong> from
                          the system. Their proposals will remain. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(user.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Invites send a magic-link email. Role changes take effect on next sign-in.
      </p>
    </div>
  );
}
