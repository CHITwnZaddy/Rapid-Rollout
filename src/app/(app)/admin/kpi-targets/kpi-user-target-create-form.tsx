"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitUpsertKpiUserTarget, type ActionResult } from "./actions";

type UserOption = { id: string; email: string };
type YearOption = { year: number; label: string };

const INITIAL: ActionResult = { ok: true };

export function KpiUserTargetCreateForm({
  users,
  activeYears,
}: {
  users: UserOption[];
  activeYears: YearOption[];
}) {
  const [state, formAction, isSaving] = useActionState(
    submitUpsertKpiUserTarget,
    INITIAL
  );

  return (
    <div className="space-y-2">
      <form
        action={formAction}
        className="grid gap-4 rounded-md border p-4 md:grid-cols-[1fr_120px_160px_120px_auto]"
      >
        <div className="space-y-2">
          <Label htmlFor="new-user-target-user">SE</Label>
          <select
            id="new-user-target-user"
            name="userId"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            required
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-target-year">Year</Label>
          <select
            id="new-user-target-year"
            name="year"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            required
          >
            {activeYears.map((target) => (
              <option key={target.year} value={target.year}>
                {target.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-target-amount">Target</Label>
          <Input
            id="new-user-target-amount"
            name="targetAmount"
            type="number"
            min="0"
            step="1000"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-target-active">Active</Label>
          <select
            id="new-user-target-active"
            name="isActive"
            defaultValue="true"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
      {!state.ok && (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
