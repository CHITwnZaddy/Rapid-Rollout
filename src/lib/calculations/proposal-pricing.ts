import { applyComplexity } from "@/lib/calculations/complexity";
import {
  calculateBidSheetPricing,
  type BidSheetPricing,
} from "@/lib/calculations/bid-sheet-pricing";
import { ceilHours } from "@/lib/calculations/rounding";

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

export type ProposalScenarioLine = {
  clientPrice: number;
  totalHours: number;
};

export type ProposalPricingSummary = {
  scenarioLines: ProposalScenarioLine[];
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
  // Per-scenario client price + hours, computed once so the bid sheet line
  // items and the subtotal cannot drift apart.
  const scenarioLines: ProposalScenarioLine[] = input.scenarios.map(
    (scenario) => {
      const factor = numberOrZero(scenario.complexity_factor) || 1;
      return {
        clientPrice: applyComplexity(
          numberOrZero(scenario.summary_total_cost),
          factor
        ),
        totalHours: applyComplexity(
          numberOrZero(scenario.summary_total_hours),
          factor
        ),
      };
    }
  );

  const scenarioSubtotal = scenarioLines.reduce(
    (sum, line) => sum + line.clientPrice,
    0
  );

  const totalHours = scenarioLines.reduce(
    (sum, line) => sum + line.totalHours,
    0
  );

  const proposalSubtotal =
    scenarioSubtotal + numberOrZero(input.migrationTotal) + numberOrZero(input.scopedTotal);

  return {
    scenarioLines,
    scenarioSubtotal,
    // Client-facing hour total: always ceil to the whole hour so the
    // estimation error lands in our favor (rounding policy 2026-06-10).
    totalHours: ceilHours(totalHours),
    proposalSubtotal,
    pricing: calculateBidSheetPricing(
      proposalSubtotal,
      input.credit,
      input.discountPercent
    ),
  };
}
