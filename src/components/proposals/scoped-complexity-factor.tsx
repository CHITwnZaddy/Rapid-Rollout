"use client";

import { ComplexityFactorInput } from "./complexity-factor-input";
import { updateScopedComplexityFactor } from "@/app/(app)/proposals/[id]/actions";

type Props = {
  proposalId: string;
  initialValue: number;
};

export function ScopedComplexityFactor({ proposalId, initialValue }: Props) {
  return (
    <ComplexityFactorInput
      initialValue={initialValue}
      helperText="1.00 = no adjustment; applies to Scoped Services Total Hrs & Cost."
      onSave={(value) => updateScopedComplexityFactor(proposalId, value)}
    />
  );
}
