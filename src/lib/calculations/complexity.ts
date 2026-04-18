export function applyComplexity(value: number, factor: number | null | undefined): number {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeFactor = Number.isFinite(factor as number) ? (factor as number) : 1;
  return safeValue * safeFactor;
}
