"use client";

import { ComplexityFactorInput } from "./complexity-factor-input";
import { updateScopedComplexityFactor } from "@/app/(app)/proposals/[id]/actions";

type Props = {
  proposalId: string;
  initialValue: number;
  onChange?: (value: number) => void;
};

export function ScopedComplexityFactor({ proposalId, initialValue, onChange }: Props) {
  return (
    <ComplexityFactorInput
      initialValue={initialValue}
      helperText="1.00 = no adjustment; applies to each Scoped Services line's hours and the cost derived from those hours."
      onSave={(value) => updateScopedComplexityFactor(proposalId, value)}
      onChange={onChange}
    />
  );
}
