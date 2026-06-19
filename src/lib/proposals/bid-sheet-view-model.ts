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
  const { proposalSubtotal, pricing, scenarioLines } =
    calculateProposalPricingSummary(input);
  const bidLineItems: BidSheetLineItem[] = [
    ...input.scenarios.map((scenario, index) => ({
      label: scenario.scenario_type,
      displayLabel: getScenarioDisplayName(scenario.scenario_type),
      clientPrice: scenarioLines[index].clientPrice,
      totalHours: scenarioLines[index].totalHours,
    })),
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
