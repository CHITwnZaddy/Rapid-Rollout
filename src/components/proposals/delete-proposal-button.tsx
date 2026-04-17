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
 *         → Step 2: Justification text + password re-entry → Delete / Cancel
 *
 * On success the user is redirected to /proposals.
 * On failure an inline error message is shown inside the dialog.
 *
 * The server action handles:
 *   - Password re-authentication via supabase.auth.signInWithPassword
 *   - Audit log write to change_log before deletion
 *   - The actual delete (child rows cascade)
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

  const [step, setStep] = useState<Step>("idle");
  const [justification, setJustification] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function openDialog() {
    setError(null);
    setJustification("");
    setPassword("");
    setStep(isInFlight ? "warn" : "confirm");
  }

  function closeDialog() {
    setStep("idle");
    setError(null);
    setJustification("");
    setPassword("");
  }

  // ── Draft deletion (single confirmation) ───────────────────────────────────

  async function handleDraftDelete() {
    setLoading(true);
    setError(null);
    // Draft deletions still re-auth — we pass an empty string and the server
    // action uses the session token check only.  Actually for drafts we still
    // want the password gate so the flow is consistent.  Use the justify step.
    // Redirect the draft confirm straight to justify instead.
    setStep("justify");
    setLoading(false);
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
    if (!password) {
      setError("Please enter your password before deleting.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await deleteProposal(proposalId, justification, password);

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Success — navigate away. The proposal is gone so we can't stay here.
    router.push("/proposals");
  }

  // ── Derived UI state ───────────────────────────────────────────────────────

  const canSubmit =
    justification.trim().length > 0 && password.length > 0 && !loading;

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
              onClick={handleDraftDelete}
              disabled={loading}
            >
              {loading ? "Deleting…" : "Delete"}
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

      {/* ── Justification + password dialog (step 2 / draft final step) ──── */}
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
                To delete this proposal, provide a justification below.
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

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="delete-password">
                To confirm, enter your Rapid Rollout password below.
              </Label>
              <Input
                id="delete-password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
