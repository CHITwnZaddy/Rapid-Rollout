import { applyComplexity } from "@/lib/calculations/complexity";
import { calculateProposalPricingSummary } from "@/lib/calculations/proposal-pricing";
import { getScenarioDisplayName } from "@/lib/scenarios/display";
import type { ScenarioData } from "@/lib/validation/proposal";

export type BidSheetLineItem = {
  label: string;
  displayLabel: string;
  clientPrice: number;
  totalHours: number;
};

type BidSheetViewModelInput = {
  scenarios: ScenarioData[];
  migrationTotal: number;
  scopedTotal: number;
  credit: number;
  discountPercent: number;
};

export function buildBidSheetViewModel(input: BidSheetViewModelInput) {
  const { proposalSubtotal, pricing } = calculateProposalPricingSummary(input);
  const bidLineItems: BidSheetLineItem[] = [
    ...input.scenarios.map((scenario) => {
      const factor = Number(scenario.complexity_factor ?? 1) || 1;
      return {
        label: scenario.scenario_type,
        displayLabel: getScenarioDisplayName(scenario.scenario_type),
        clientPrice: applyComplexity(
          Number(scenario.summary_total_cost),
          factor
        ),
        totalHours: applyComplexity(
          Number(scenario.summary_total_hours),
          factor
        ),
      };
    }),
    {
      label: "Scoped Services",
      displayLabel: "Scoped Services",
      clientPrice: input.scopedTotal,
      totalHours: 0,
    },
    {
      label: "Migration Services",
      displayLabel: "Migration Services",
      clientPrice: input.migrationTotal,
      totalHours: 0,
    },
  ].filter((item) => item.clientPrice > 0 || item.totalHours > 0);

  return { proposalSubtotal, pricing, bidLineItems };
}
