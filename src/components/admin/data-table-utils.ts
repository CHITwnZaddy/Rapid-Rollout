export type ColumnType = "text" | "number";

export type ColumnDef = {
  key: string;
  label: string;
  type?: ColumnType;
  editable?: boolean;
  width?: string;
};

export type EditableValueResult =
  | { ok: true; value: string | number }
  | { ok: false; error: string };

export function normalizeEditableValue(
  rawValue: string,
  column: ColumnDef
): EditableValueResult {
  if (column.type !== "number") {
    return { ok: true, value: rawValue };
  }

  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return {
      ok: false,
      error: `${column.label} must be a valid number.`,
    };
  }

  return { ok: true, value: parsed };
}

export function buildNewRow(
  columns: ColumnDef[],
  createDefaults: Record<string, unknown>,
  timestampSeed: number
): Record<string, unknown> {
  const nextRow: Record<string, unknown> = { ...createDefaults };

  for (const [key, value] of Object.entries(nextRow)) {
    if (typeof value === "string" && value.includes("__AUTO__")) {
      nextRow[key] = value.replaceAll("__AUTO__", String(timestampSeed));
    }
  }

  for (const column of columns) {
    if (!(column.key in nextRow)) {
      nextRow[column.key] = column.type === "number" ? 0 : "";
    }
  }

  return nextRow;
}
