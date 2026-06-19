"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { submitUpdateStaleThreshold, type ActionResult } from "./actions";

type StaleThreshold = {
  id: string;
  status: string;
  threshold_days: number;
  is_active: boolean;
};

const INITIAL: ActionResult = { ok: true };

export function StaleThresholdRow({ threshold }: { threshold: StaleThreshold }) {
  const [state, formAction, isPending] = useActionState(
    submitUpdateStaleThreshold,
    INITIAL
  );
  const formId = `stale-threshold-${threshold.id}`;

  return (
    <TableRow>
      <TableCell className="font-medium">{threshold.status}</TableCell>
      <TableCell>
        <form id={formId} action={formAction}>
          <input type="hidden" name="id" value={threshold.id} />
          <input type="hidden" name="status" value={threshold.status} />
          <Input
            name="thresholdDays"
            type="number"
            min="1"
            step="1"
            defaultValue={threshold.threshold_days}
            aria-label={`${threshold.status} stale threshold days`}
            className="w-32"
          />
        </form>
        {!state.ok && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {state.error}
          </p>
        )}
      </TableCell>
      <TableCell>
        <select
          name="isActive"
          form={formId}
          defaultValue={threshold.is_active ? "true" : "false"}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label={`${threshold.status} active state`}
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
