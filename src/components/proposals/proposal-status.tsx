"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateProposalStatus } from "@/app/(app)/proposals/[id]/actions";
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_VARIANT,
  type ProposalStatus,
} from "@/lib/constants/statuses";

// The dropdown stages a local value; the Save button is the only
// thing that commits the change. This forces intentional transitions
// and gives the server action exactly one place to write a history row.
// Save is disabled until the staged value differs from the committed
// status (no point writing a history row for no-op transitions).
export function ProposalStatus({
  proposalId,
  initialStatus,
}: {
  proposalId: string;
  initialStatus: string;
}) {
  const [committed, setCommitted] = useState(initialStatus);
  const [staged, setStaged] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  const isDirty = staged !== committed;
  const variant =
    PROPOSAL_STATUS_VARIANT[committed as ProposalStatus] ?? "secondary";

  const save = () => {
    if (!isDirty) return;
    startTransition(async () => {
      const result = await updateProposalStatus(proposalId, staged);
      if (!result.ok) {
        toast.error(result.error);
        setStaged(committed);
        return;
      }
      setCommitted(staged);
      toast.success(`Status updated to "${staged}".`);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={staged}
        onValueChange={(v) => v && setStaged(v)}
        disabled={isPending}
      >
        <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent p-0 shadow-none">
          <Badge variant={variant}>
            <SelectValue>{staged}</SelectValue>
          </Badge>
        </SelectTrigger>
        <SelectContent>
          {PROPOSAL_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        onClick={save}
        disabled={!isDirty || isPending}
        className="h-7"
      >
        {isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
