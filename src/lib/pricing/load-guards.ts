type QueryError = { message?: string } | null;

type SupabaseLoadResult<T> = {
  data: T | null | undefined;
  error: QueryError;
};

type RateLookupRow = {
  lookup_key: string | null;
};

export function getLoadError<T>(
  result: SupabaseLoadResult<T>,
  source: string
): string | null {
  if (result.error) {
    return `Could not load ${source}: ${result.error.message ?? "unknown error"}.`;
  }
  if (result.data == null) {
    return `Could not load ${source}: no data returned.`;
  }
  return null;
}

function buildActiveKeySet(rateCards: RateLookupRow[]): Set<string> {
  return new Set(
    rateCards
      .map((rateCard) => rateCard.lookup_key)
      .filter((key): key is string => Boolean(key))
  );
}

// Required-rate guard. Returns an error unless every required key is present
// AND priced above zero. A rate_cards row with rate 0 passes a presence check
// but would silently zero pricing downstream, so fail closed on it too.
export function getRequiredRateCardsError(
  rateCards: readonly { lookup_key: string | null; rate: number | null }[],
  requiredKeys: readonly string[],
  context: string
): string | null {
  const rateByKey = new Map<string, number>();
  for (const rateCard of rateCards) {
    if (rateCard.lookup_key && Number.isFinite(Number(rateCard.rate))) {
      rateByKey.set(rateCard.lookup_key, Number(rateCard.rate));
    }
  }
  const invalid = requiredKeys.filter((key) => !((rateByKey.get(key) ?? 0) > 0));

  if (invalid.length === 0) return null;

  return `Required rate card rows for ${context} are missing or have a non-positive rate: ${invalid.join(", ")}.`;
}

export function getUnknownRateLookupError<T>(
  rows: T[],
  rateCards: RateLookupRow[],
  getLookupKey: (row: T) => string | null | undefined,
  context: string
): string | null {
  const activeKeys = buildActiveKeySet(rateCards);
  const missing = Array.from(
    new Set(
      rows
        .map(getLookupKey)
        .filter(
          (lookupKey): lookupKey is string =>
            typeof lookupKey === "string" &&
            lookupKey.length > 0 &&
            !activeKeys.has(lookupKey)
        )
    )
  );

  if (missing.length === 0) return null;

  return `${context} unavailable: saved rows reference inactive or missing rate card rows: ${missing.join(", ")}.`;
}
