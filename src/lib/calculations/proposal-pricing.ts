import { applyComplexity } from "@/lib/calculations/complexity";
import {
  calculateBidSheetPricing,
  type BidSheetPricing,
} from "@/lib/calculations/bid-sheet-pricing";

export type ProposalPricingScenarioRow = {
  summary_total_cost: unknown;
  summary_total_hours: unknown;
  complexity_factor?: unknown;
};

export type ProposalPricingInput = {
  scenarios: ProposalPricingScenarioRow[];
  migrationTotal: number;
  scopedTotal: number;
  credit: number;
  discountPercent: number;
};

export type ProposalPricingSummary = {
  scenarioSubtotal: number;
  totalHours: number;
  proposalSubtotal: number;
  pricing: BidSheetPricing;
};

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateProposalPricingSummary(
  input: ProposalPricingInput
): ProposalPricingSummary {
  const scenarioSubtotal = input.scenarios.reduce(
    (sum, scenario) =>
      sum +
      applyComplexity(
        numberOrZero(scenario.summary_total_cost),
        numberOrZero(scenario.complexity_factor) || 1
      ),
    0
  );

  const totalHours = input.scenarios.reduce(
    (sum, scenario) =>
      sum +
      applyComplexity(
        numberOrZero(scenario.summary_total_hours),
        numberOrZero(scenario.complexity_factor) || 1
      ),
    0
  );

  const proposalSubtotal =
    scenarioSubtotal + numberOrZero(input.migrationTotal) + numberOrZero(input.scopedTotal);

  return {
    scenarioSubtotal,
    totalHours,
    proposalSubtotal,
    pricing: calculateBidSheetPricing(
      proposalSubtotal,
      input.credit,
      input.discountPercent
    ),
  };
}
