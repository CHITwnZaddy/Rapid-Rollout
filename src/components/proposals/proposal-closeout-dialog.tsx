"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  closeProposalLost,
  closeProposalWon,
} from "@/app/(app)/proposals/[id]/actions";
import type { ProposalStatus } from "@/lib/constants/statuses";
import type { ClosedProposalStatus } from "@/lib/proposals/status";

export type VarianceReasonOption = {
  code: string;
  label: string;
};

type ProposalCloseoutDialogProps = {
  proposalId: string;
  status: ClosedProposalStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed: (status: ProposalStatus) => void;
  initialSoldPrice: number;
  initialLoeValue: number;
  varianceReasons: VarianceReasonOption[];
};

export function ProposalCloseoutDialog({
  proposalId,
  status,
  open,
  onOpenChange,
  onClosed,
  initialSoldPrice,
  initialLoeValue,
  varianceReasons,
}: ProposalCloseoutDialogProps) {
  const [soldPrice, setSoldPrice] = useState(String(initialSoldPrice || ""));
  const [loeValue, setLoeValue] = useState(String(initialLoeValue || ""));
  const [loeSignedDate, setLoeSignedDate] = useState("");
  const [varianceReasonCode, setVarianceReasonCode] = useState("");
  const [varianceNote, setVarianceNote] = useState("");
  const [closedLostReason, setClosedLostReason] = useState("");
  const [closedLostNote, setClosedLostNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isClosedWon = status === "Closed Won";
  const title = isClosedWon ? "Close proposal won" : "Close proposal lost";

  function submit() {
    if (!status) return;
    setError(null);

    startTransition(async () => {
      const result = isClosedWon
        ? await closeProposalWon(proposalId, {
            soldPrice: Number(soldPrice),
            loeValue: Number(loeValue),
            loeSignedDate,
            varianceReasonCode,
            varianceNote,
          })
        : await closeProposalLost(proposalId, {
            closedLostReason,
            closedLostNote,
          });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onOpenChange(false);
      onClosed(status);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!isPending} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Closing a proposal records the final commercial facts for reporting.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {isClosedWon ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="closeout-sold-price">Sold price</Label>
              <Input
                id="closeout-sold-price"
                type="number"
                min="0"
                step="0.01"
                value={soldPrice}
                onChange={(event) => setSoldPrice(event.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closeout-loe-value">Signed LoE value</Label>
              <Input
                id="closeout-loe-value"
                type="number"
                min="0"
                step="0.01"
                value={loeValue}
                onChange={(event) => setLoeValue(event.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closeout-loe-date">LoE signed date</Label>
              <Input
                id="closeout-loe-date"
                type="date"
                value={loeSignedDate}
                onChange={(event) => setLoeSignedDate(event.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closeout-variance-reason">Variance reason</Label>
              <select
                id="closeout-variance-reason"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={varianceReasonCode}
                onChange={(event) => setVarianceReasonCode(event.target.value)}
                disabled={isPending}
              >
                <option value="">None</option>
                {varianceReasons.map((reason) => (
                  <option key={reason.code} value={reason.code}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="closeout-variance-note">Internal variance note</Label>
              <Textarea
                id="closeout-variance-note"
                value={varianceNote}
                onChange={(event) => setVarianceNote(event.target.value)}
                disabled={isPending}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="closeout-lost-reason">Closed Lost reason</Label>
              <Input
                id="closeout-lost-reason"
                value={closedLostReason}
                onChange={(event) => setClosedLostReason(event.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closeout-lost-note">Closed Lost note</Label>
              <Textarea
                id="closeout-lost-note"
                value={closedLostNote}
                onChange={(event) => setClosedLostNote(event.target.value)}
                disabled={isPending}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Saving..." : "Close proposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
