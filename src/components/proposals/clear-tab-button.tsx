"use client";

import { useState } from "react";
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
  const [clearing, setClearing] = useState(false);

  const handleConfirm = async () => {
    setClearing(true);
    try {
      await onConfirm();
    } finally {
      setClearing(false);
    }
  };

  return (
    <AlertDialog>
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
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Clear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
