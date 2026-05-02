export type VarianceDirection = "under" | "even" | "over";

export type CloseoutResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ClosedWonCloseoutInput = {
  soldPrice: number;
  loeValue: number;
  loeSignedDate: string;
  varianceReasonCode: string | null;
  varianceNote: string | null;
};

export type ClosedWonCloseoutData = {
  soldPrice: number;
  loeValue: number;
  loeSignedDate: string;
  varianceReasonCode: string | null;
  varianceNote: string | null;
  varianceAmount: number;
};

export type ClosedLostCloseoutInput = {
  closedLostReason: string | null;
  closedLostNote: string | null;
};

export type ClosedLostCloseoutData = {
  closedLostReason: string;
  closedLostNote: string;
};

function trimOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function hasMinimumNote(value: string | null): boolean {
  return (value?.trim().length ?? 0) >= 10;
}

export function calculateVariance(
  soldPrice: number,
  loeValue: number
): { amount: number; direction: VarianceDirection } {
  const amount = Math.round((loeValue - soldPrice) * 100) / 100;
  const direction: VarianceDirection =
    amount < 0 ? "under" : amount > 0 ? "over" : "even";

  return { amount, direction };
}

export function requiresUnderVarianceReason(
  soldPrice: number,
  loeValue: number
): boolean {
  return calculateVariance(soldPrice, loeValue).direction === "under";
}

export function validateClosedWonCloseout(
  input: ClosedWonCloseoutInput
): CloseoutResult<ClosedWonCloseoutData> {
  const loeSignedDate = trimOptional(input.loeSignedDate);
  if (!loeSignedDate) {
    return { ok: false, error: "LoE signed date is required for Closed Won." };
  }

  if (!Number.isFinite(input.soldPrice) || input.soldPrice < 0) {
    return { ok: false, error: "Sold price must be zero or greater." };
  }

  if (!Number.isFinite(input.loeValue) || input.loeValue < 0) {
    return { ok: false, error: "LoE value must be zero or greater." };
  }

  const variance = calculateVariance(input.soldPrice, input.loeValue);
  const varianceReasonCode = trimOptional(input.varianceReasonCode);
  const varianceNote = trimOptional(input.varianceNote);

  if (variance.direction === "under" && !varianceReasonCode) {
    return {
      ok: false,
      error: "Variance reason is required when LoE value is under sold price.",
    };
  }

  if (variance.direction === "under" && !hasMinimumNote(varianceNote)) {
    return { ok: false, error: "Variance note must be at least 10 characters." };
  }

  return {
    ok: true,
    data: {
      soldPrice: input.soldPrice,
      loeValue: input.loeValue,
      loeSignedDate,
      varianceReasonCode: variance.direction === "under" ? varianceReasonCode : null,
      varianceNote: variance.direction === "under" ? varianceNote : null,
      varianceAmount: variance.amount,
    },
  };
}

export function validateClosedLostCloseout(
  input: ClosedLostCloseoutInput
): CloseoutResult<ClosedLostCloseoutData> {
  const closedLostReason = trimOptional(input.closedLostReason);
  if (!closedLostReason) {
    return { ok: false, error: "Closed Lost reason is required." };
  }

  const closedLostNote = trimOptional(input.closedLostNote);
  if (!hasMinimumNote(closedLostNote)) {
    return { ok: false, error: "Closed Lost note must be at least 10 characters." };
  }

  return {
    ok: true,
    data: {
      closedLostReason,
      closedLostNote: closedLostNote!,
    },
  };
}
