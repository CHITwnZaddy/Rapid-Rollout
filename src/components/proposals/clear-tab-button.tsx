"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

// Shared "wipe this tab" button with a confirmation dialog. Clearing is
// destructive and has no undo, so every tab that offers it goes through
// the same confirm step.
export function ClearTabButton({
  description,
  onConfirm,
  disabled,
}: {
  /** What exactly gets wiped, shown in the confirm dialog. */
  description: string;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
}) {
  // Controlled open state: AlertDialogAction is a plain button (unlike
  // Cancel, which is a Close primitive), so the dialog must be closed
  // explicitly once the clear finishes.
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleConfirm = async () => {
    setClearing(true);
    try {
      await onConfirm();
      // Close only on success so a failed clear keeps the dialog open for retry.
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to clear tab. Please try again."
      );
    } finally {
      setClearing(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={disabled || clearing}
          />
        }
      >
        {clearing ? "Clearing..." : "Clear Tab"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear this tab?</AlertDialogTitle>
          <AlertDialogDescription>
            {description} This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void handleConfirm()}
            disabled={clearing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {clearing ? "Clearing..." : "Clear"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
