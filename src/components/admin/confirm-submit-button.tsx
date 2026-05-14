"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

type ConfirmSubmitButtonProps = {
  children: ReactNode;
  form: string;
  message: string;
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
};

export function ConfirmSubmitButton({
  children,
  form,
  message,
  size = "sm",
  variant = "destructive",
}: ConfirmSubmitButtonProps) {
  return (
    <Button
      type="submit"
      form={form}
      size={size}
      variant={variant}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
