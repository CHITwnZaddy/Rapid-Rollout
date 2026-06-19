"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { submitUpdateVarianceReason, type ActionResult } from "./actions";

type VarianceReason = {
  id: string;
  code: string;
  label: string;
  description: string;
  sort_order: number;
  is_active: boolean;
};

const INITIAL: ActionResult = { ok: true };

export function VarianceReasonRow({ reason }: { reason: VarianceReason }) {
  const [state, formAction, isPending] = useActionState(
    submitUpdateVarianceReason,
    INITIAL
  );
  const formId = `variance-reason-${reason.id}`;

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{reason.code}</TableCell>
      <TableCell>
        <form id={formId} action={formAction}>
          <input type="hidden" name="id" value={reason.id} />
          <input type="hidden" name="code" value={reason.code} />
          <Input
            name="label"
            defaultValue={reason.label}
            aria-label={`${reason.code} label`}
            className="w-44"
          />
        </form>
        {!state.ok && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {state.error}
          </p>
        )}
      </TableCell>
      <TableCell>
        <Input
          name="description"
          form={formId}
          defaultValue={reason.description}
          aria-label={`${reason.code} description`}
          className="min-w-80"
        />
      </TableCell>
      <TableCell>
        <Input
          name="sortOrder"
          form={formId}
          type="number"
          min="0"
          step="1"
          defaultValue={reason.sort_order}
          aria-label={`${reason.code} sort order`}
          className="w-24"
        />
      </TableCell>
      <TableCell>
        <select
          name="isActive"
          form={formId}
          defaultValue={reason.is_active ? "true" : "false"}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label={`${reason.code} active state`}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </TableCell>
      <TableCell>
        <Button type="submit" size="sm" form={formId} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </TableCell>
    </TableRow>
  );
}
