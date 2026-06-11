export type ContingencyPricingBreakout = {
  baseHours: number;
  contingencyHours: number;
  totalClientHours: number;
  baseCost: number;
  contingencyCost: number;
  clientPrice: number;
  internalCost: number;
  marginPercent: number | null;
};

export type RolePricingInput = {
  role: "srIm" | "pm" | "ba";
  label: string;
  baseHours: number;
  rate: number;
};

export type RolePricingBreakout = ContingencyPricingBreakout &
  RolePricingInput & {
    totalClientCost: number;
  };

import { roundPercent } from "@/lib/calculations/rounding";

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function calculateMarginPercent(
  clientPrice: number,
  internalCost: number
): number | null {
  if (clientPrice <= 0) return null;
  // Margin is a client-facing edge value — rounding policy applies here
  // so display, export, and any persisted copy always agree.
  return roundPercent(((clientPrice - internalCost) / clientPrice) * 100);
}

export function calculateContingencyPricingBreakout(
  baseHours: number,
  baseCost: number,
  complexityFactor: number,
  internalCostRate: number,
  clientPriceOverride?: number
): ContingencyPricingBreakout {
  const safeBaseHours = finiteNumber(baseHours);
  const safeBaseCost = finiteNumber(baseCost);
  const safeFactor = Number.isFinite(complexityFactor) ? complexityFactor : 1;
  const contingencyMultiplier = safeFactor - 1;
  const contingencyHours = safeBaseHours * contingencyMultiplier;
  const contingencyCost = safeBaseCost * contingencyMultiplier;
  const clientPrice = clientPriceOverride ?? safeBaseCost + contingencyCost;
  const internalCost = safeBaseHours * finiteNumber(internalCostRate);

  return {
    baseHours: safeBaseHours,
    contingencyHours,
    totalClientHours: safeBaseHours + contingencyHours,
    baseCost: safeBaseCost,
    contingencyCost,
    clientPrice,
    internalCost,
    marginPercent: calculateMarginPercent(clientPrice, internalCost),
  };
}

export function calculateRolePricingBreakouts(
  roles: RolePricingInput[],
  complexityFactor: number,
  internalCostRate: number
): RolePricingBreakout[] {
  return roles.map((role) => {
    const baseCost = finiteNumber(role.baseHours) * finiteNumber(role.rate);
    const breakout = calculateContingencyPricingBreakout(
      role.baseHours,
      baseCost,
      complexityFactor,
      internalCostRate
    );

    return {
      ...role,
      ...breakout,
      totalClientCost: breakout.clientPrice,
    };
  });
}

export function sumContingencyBreakouts(
  breakouts: ContingencyPricingBreakout[],
  clientPriceOverride?: number
): ContingencyPricingBreakout {
  const baseHours = breakouts.reduce((sum, item) => sum + item.baseHours, 0);
  const contingencyHours = breakouts.reduce(
    (sum, item) => sum + item.contingencyHours,
    0
  );
  const baseCost = breakouts.reduce((sum, item) => sum + item.baseCost, 0);
  const contingencyCost = breakouts.reduce(
    (sum, item) => sum + item.contingencyCost,
    0
  );
  const internalCost = breakouts.reduce(
    (sum, item) => sum + item.internalCost,
    0
  );
  const clientPrice = clientPriceOverride ?? baseCost + contingencyCost;

  return {
    baseHours,
    contingencyHours,
    totalClientHours: baseHours + contingencyHours,
    baseCost,
    contingencyCost,
    clientPrice,
    internalCost,
    marginPercent: calculateMarginPercent(clientPrice, internalCost),
  };
}

export function allocateDiscountedMarginPercent(
  discountedClientPrice: number,
  internalCost: number
): number | null {
  return calculateMarginPercent(discountedClientPrice, internalCost);
}
