"use client";

/**
 * DeleteProposalButton
 *
 * Renders a destructive "Delete" button in the proposal header.
 * The deletion flow differs based on proposal status:
 *
 * Draft proposals:
 *   Click → single confirmation dialog → Delete / Cancel
 *
 * Non-draft proposals ("in flight"):
 *   Click → Step 1: "In flight" warning → Yes, continue / Cancel
 *         → Step 2: Justification + typed confirmation → Delete / Cancel
 *
 * On success the user is redirected to /proposals.
 * On failure an inline error message is shown inside the dialog.
 *
 * The server action handles:
 *   - assertAuthenticated() session check
 *   - Typed-confirmation match against the live proposal.name
 *   - Audit log write to change_log before deletion
 *   - The actual delete (child rows cascade)
 *
 * Why typed-confirmation instead of a password re-auth: the server action
 * used to call supabase.auth.signInWithPassword() as the friction gate,
 * which issues a new session on every attempt and pushes the plaintext
 * password through the action pipeline. The typed-confirmation is purely a
 * UX friction gate — the real auth boundary is assertAuthenticated() + RLS
 * on the server.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { deleteProposal } from "@/app/(app)/proposals/[id]/actions";
import { buildDeleteConfirmationPhrase } from "@/lib/proposals/delete-confirmation";

// Statuses that are considered "in flight" and require the extra friction step.
const IN_FLIGHT_STATUSES = new Set([
  "Proposal Sent",
  "Customer Review",
  "Won",
  "Lost",
  "VOID",
]);

type Step = "idle" | "confirm" | "warn" | "justify";

interface DeleteProposalButtonProps {
  proposalId: string;
  proposalName: string;
  status: string;
}

export function DeleteProposalButton({
  proposalId,
  proposalName,
  status,
}: DeleteProposalButtonProps) {
  const router = useRouter();
  const isInFlight = IN_FLIGHT_STATUSES.has(status);
  const expectedPhrase = buildDeleteConfirmationPhrase(proposalName);

  const [step, setStep] = useState<Step>("idle");
  const [justification, setJustification] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function openDialog() {
    setError(null);
    setJustification("");
    setConfirmationText("");
    setStep(isInFlight ? "warn" : "confirm");
  }

  function closeDialog() {
    setStep("idle");
    setError(null);
    setJustification("");
    setConfirmationText("");
  }

  // ── Draft deletion (single confirmation → justify) ─────────────────────────
  //
  // Drafts use the same justify step as in-flight deletions for consistency:
  // the audit log expects a justification on every delete.

  function handleDraftConfirm() {
    setError(null);
    setStep("justify");
  }

  // ── In-flight step 1: acknowledge warning ──────────────────────────────────

  function handleWarnContinue() {
    setError(null);
    setStep("justify");
  }

  // ── Final deletion (justify step for both draft and non-draft) ────────────

  async function handleFinalDelete() {
    if (!justification.trim()) {
      setError("Please enter a justification before deleting.");
      return;
    }
    if (confirmationText.trim() !== expectedPhrase) {
      setError(`Type "${expectedPhrase}" exactly to confirm.`);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await deleteProposal(proposalId, justification, confirmationText);

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Success — navigate away. The proposal is gone so we can't stay here.
    router.push("/proposals");
  }

  // ── Derived UI state ───────────────────────────────────────────────────────

  const confirmationMatches = confirmationText.trim() === expectedPhrase;
  const canSubmit =
    justification.trim().length > 0 && confirmationMatches && !loading;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger button — shown in the proposal header */}
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={openDialog}
      >
        <Trash2 className="mr-1.5 h-4 w-4" />
        Delete
      </Button>

      {/* ── Draft confirmation dialog ─────────────────────────────────────── */}
      <Dialog open={step === "confirm"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete proposal?</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{proposalName}</strong> will
              be permanently deleted along with all scenarios, line items, and
              migration data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDraftConfirm}
              disabled={loading}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── In-flight warning dialog (step 1) ────────────────────────────── */}
      <Dialog open={step === "warn"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>This proposal is in flight</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{proposalName}</strong> has a
              status of <strong className="text-foreground">{status}</strong>.
              Are you sure you want to delete it?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleWarnContinue}>
              Yes, delete it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Justification + typed confirmation dialog (final step) ───────── */}
      <Dialog open={step === "justify"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm deletion</DialogTitle>
            <DialogDescription>
              This action is permanent and will be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Justification */}
            <div className="space-y-1.5">
              <Label htmlFor="delete-justification">
                Reason for deletion
              </Label>
              <Textarea
                id="delete-justification"
                placeholder="Enter your reason for deletion…"
                rows={3}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Typed confirmation */}
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirmation">
                Type{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  {expectedPhrase}
                </code>{" "}
                to confirm
              </Label>
              <Input
                id="delete-confirmation"
                type="text"
                placeholder={expectedPhrase}
                autoComplete="off"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) handleFinalDelete();
                }}
              />
            </div>

            {error && (
              <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFinalDelete}
              disabled={!canSubmit}
            >
              {loading ? "Deleting…" : "Delete Proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
