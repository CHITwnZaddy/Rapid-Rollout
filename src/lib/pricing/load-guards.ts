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

export function getRequiredRateCardsError(
  rateCards: RateLookupRow[],
  requiredKeys: readonly string[],
  context: string
): string | null {
  const activeKeys = buildActiveKeySet(rateCards);
  const missing = requiredKeys.filter((key) => !activeKeys.has(key));

  if (missing.length === 0) return null;

  return `Missing required rate card rows for ${context}: ${missing.join(", ")}.`;
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
