"use client";

import { ComplexityFactorInput } from "./complexity-factor-input";
import { updateScenarioComplexityFactor } from "@/app/(app)/proposals/[id]/actions";

type Props = {
  scenarioId: string;
  proposalId: string;
  initialValue: number;
};

export function ScenarioComplexityFactor({
  scenarioId,
  proposalId,
  initialValue,
}: Props) {
  return (
    <ComplexityFactorInput
      initialValue={initialValue}
      helperText="1.00 = no adjustment; applies to this scenario's Total Hrs & Total Cost."
      onSave={(value) =>
        updateScenarioComplexityFactor(scenarioId, proposalId, value)
      }
    />
  );
}
