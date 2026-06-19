"use client";

import { useActionState } from "react";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  submitDeleteKpiYearTarget,
  submitUpdateKpiYearTarget,
  type ActionResult,
} from "./actions";

type YearTarget = {
  id: string;
  year: number;
  label: string;
  team_quota: number;
  is_active: boolean;
};

const INITIAL: ActionResult = { ok: true };

export function KpiYearTargetRow({ target }: { target: YearTarget }) {
  const [updateState, updateAction, isSaving] = useActionState(
    submitUpdateKpiYearTarget,
    INITIAL
  );
  const [deleteState, deleteAction] = useActionState(
    submitDeleteKpiYearTarget,
    INITIAL
  );
  const formId = `year-target-${target.id}`;
  const deleteFormId = `delete-year-target-${target.id}`;
  const error = !updateState.ok
    ? updateState.error
    : !deleteState.ok
      ? deleteState.error
      : null;

  return (
    <TableRow>
      <TableCell className="font-medium">{target.year}</TableCell>
      <TableCell>{target.label}</TableCell>
      <TableCell>
        <form id={formId} action={updateAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={target.id} />
          <input type="hidden" name="year" value={target.year} />
          <input type="hidden" name="label" value={target.label} />
          <Input
            name="teamQuota"
            type="number"
            min="0"
            step="1000"
            defaultValue={target.team_quota}
            aria-label={`${target.label} team quota`}
            className="w-40"
          />
        </form>
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
          aria-label={`${target.label} active state`}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </TableCell>
      <TableCell>
        <form id={deleteFormId} action={deleteAction}>
          <input type="hidden" name="id" value={target.id} />
        </form>
        <div className="flex gap-2">
          <Button type="submit" size="sm" form={formId} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <ConfirmSubmitButton
            form={deleteFormId}
            message={`Delete ${target.label}? This also deletes SE targets tied to ${target.year}.`}
          >
            Delete
          </ConfirmSubmitButton>
        </div>
      </TableCell>
    </TableRow>
  );
}
