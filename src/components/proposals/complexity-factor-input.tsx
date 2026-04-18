"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Props = {
  initialValue: number;
  label?: string;
  helperText?: string;
  onSave: (value: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  onChange?: (value: number) => void;
};

export function ComplexityFactorInput({
  initialValue,
  label = "Complexity Factor",
  helperText = "1.00 = no adjustment; 1.15 = +15% surcharge.",
  onSave,
  onChange,
}: Props) {
  const [value, setValue] = useState(initialValue.toFixed(2));
  const [isPending, startTransition] = useTransition();

  const commit = () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0.5 || parsed > 9.99) {
      toast.error("Complexity factor must be between 0.50 and 9.99.");
      setValue(initialValue.toFixed(2));
      return;
    }
    if (parsed === initialValue) return;

    startTransition(async () => {
      const result = await onSave(parsed);
      if (!result.ok) {
        toast.error(`Failed to save: ${result.error}`);
        setValue(initialValue.toFixed(2));
      } else {
        toast.success("Complexity factor saved.");
        onChange?.(parsed);
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Label className="text-sm font-medium whitespace-nowrap">{label}</Label>
      <Input
        type="number"
        min={0.5}
        max={9.99}
        step={0.01}
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="w-24"
      />
      <span className="text-xs text-muted-foreground">{helperText}</span>
    </div>
  );
}
