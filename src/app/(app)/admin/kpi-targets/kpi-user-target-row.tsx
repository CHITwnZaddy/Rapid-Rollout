"use client";

import { useActionState } from "react";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/calculations/engine";
import {
  submitDeleteKpiUserTarget,
  submitUpsertKpiUserTarget,
  type ActionResult,
} from "./actions";

type UserTarget = {
  id: string;
  year: number;
  user_id: string;
  target_amount: number;
  is_active: boolean;
};

const INITIAL: ActionResult = { ok: true };

export function KpiUserTargetRow({
  target,
  userEmail,
  yearLabel,
}: {
  target: UserTarget;
  userEmail: string;
  yearLabel: string;
}) {
  const [saveState, saveAction, isSaving] = useActionState(
    submitUpsertKpiUserTarget,
    INITIAL
  );
  const [deleteState, deleteAction] = useActionState(
    submitDeleteKpiUserTarget,
    INITIAL
  );
  const formId = `user-target-${target.id}`;
  const deleteFormId = `delete-user-target-${target.id}`;
  const error = !saveState.ok
    ? saveState.error
    : !deleteState.ok
      ? deleteState.error
      : null;

  return (
    <TableRow>
      <TableCell>{userEmail}</TableCell>
      <TableCell>{yearLabel}</TableCell>
      <TableCell>
        <form action={saveAction} id={formId}>
          <input type="hidden" name="id" value={target.id} />
          <input type="hidden" name="year" value={target.year} />
          <input type="hidden" name="userId" value={target.user_id} />
          <Input
            name="targetAmount"
            type="number"
            min="0"
            step="1000"
            defaultValue={target.target_amount}
            aria-label={`${userEmail} target amount`}
            className="w-40"
          />
        </form>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatCurrency(target.target_amount)}
        </p>
        {error && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </TableCell>
      <TableCell>
        <select
          name="isActive"
          form={formId}
          defaultValue={target.is_active ? "true" : "false"}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label={`${userEmail} active state`}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </TableCell>
      <TableCell>
        <form action={deleteAction} id={deleteFormId}>
          <input type="hidden" name="id" value={target.id} />
        </form>
        <div className="flex gap-2">
          <Button type="submit" size="sm" form={formId} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <ConfirmSubmitButton
            form={deleteFormId}
            message={`Delete ${userEmail} target for ${yearLabel}?`}
          >
            Delete
          </ConfirmSubmitButton>
        </div>
      </TableCell>
    </TableRow>
  );
}
