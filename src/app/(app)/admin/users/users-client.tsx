"use client";

import { useState, useTransition } from "react";
import { inviteUser, updateUserRole, deleteUser, type UserRow } from "./actions";
import type { AppRole } from "@/lib/auth/roles";
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

const ROLE_OPTIONS: Array<{ value: AppRole; label: string }> = [
  { value: "user", label: "User (SE)" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

function roleSelectValue(role: AppRole | null): AppRole {
  return role ?? "user";
}

export function UsersClient({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("user");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleInvite() {
    if (!inviteEmail.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await inviteUser(inviteEmail.trim(), inviteRole);
      if (result.ok) {
        setInviteEmail("");
        // Append the new account right away. This component seeds its own
        // state from the server prop, so the revalidated page alone would not
        // show the invite until a full reload (and admins re-invited).
        setUsers((prev) =>
          prev.some((u) => u.id === result.user.id)
            ? prev
            : [...prev, result.user]
        );
      } else {
        setError(result.error);
      }
    });
  }

  function handleRoleChange(userId: string, role: AppRole) {
    setError(null);
    startTransition(async () => {
      const result = await updateUserRole(userId, role);
      if (result.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, role: role === "user" ? null : role } : u
          )
        );
      } else {
        setError(result.error);
      }
    });
  }

  function handleDelete(userId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (result.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      } else {
        setError(result.error);
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
            onValueChange={(v) => setInviteRole((v as AppRole | null) ?? "user")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
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
                    value={roleSelectValue(user.role)}
                    onValueChange={(v) =>
                      handleRoleChange(user.id, (v as AppRole | null) ?? "user")
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger className="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
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
                          This removes <strong>{user.email}</strong>&apos;s access:
                          they are signed out everywhere and can no longer sign
                          in. Their proposals and history remain, and the email
                          address can be invited again later. This cannot be
                          undone.
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
