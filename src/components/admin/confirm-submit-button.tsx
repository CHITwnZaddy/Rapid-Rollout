"use client";

import { useState, type ReactNode } from "react";

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

type ConfirmSubmitButtonProps = {
  children: ReactNode;
  form: string;
  message: string;
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
};

// Submit button guarded by a confirmation dialog. The trigger opens a
// non-blocking AlertDialog (no window.confirm, which blocks the main thread and
// inflates INP); confirming submits the associated form by id, preserving the
// form={id} contract callers already rely on so the form's action still runs.
export function ConfirmSubmitButton({
  children,
  form,
  message,
  size = "sm",
  variant = "destructive",
}: ConfirmSubmitButtonProps) {
  // Controlled open: AlertDialogAction is a plain button (unlike Cancel, a Close
  // primitive), so close it explicitly after submitting.
  const [open, setOpen] = useState(false);

  const handleConfirm = () => {
    const target = document.getElementById(form);
    if (target instanceof HTMLFormElement) {
      target.requestSubmit();
    }
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button type="button" size={size} variant={variant} />}
      >
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            size={size}
            onClick={handleConfirm}
          >
            {children}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
