import { NUM } from "./num";
import type { MigrationDetailLine } from "./migration-engine";
import { migrationSectionSchema } from "@/lib/validation/migration";

type MigrationSectionLike = {
  section: string;
};

type MigrationLineLike = MigrationSectionLike & {
  id?: string | null;
  label: string;
  quantity: unknown;
  items_per_object: unknown;
  total_line_items: unknown;
  row_order?: number | null;
};

type ToEngineLineOptions = {
  quantityOverride?: number;
  idDefault?: string;
  rowOrderDefault?: number;
};

export function parseMigrationSection(
  section: string
): MigrationDetailLine["section"] {
  const result = migrationSectionSchema.safeParse(section);

  if (result.success) {
    return result.data;
  }

  throw new Error(`Unknown migration detail section: ${section}`);
}

export function hasMigrationSection(
  line: MigrationSectionLike,
  section: MigrationDetailLine["section"]
): boolean {
  return parseMigrationSection(line.section) === section;
}

// Convert a DB migration_detail_lines row (or an in-memory line from a
// report loader) into the engine-shaped MigrationDetailLine that
// calculateMigrationTotals expects. Exists so every caller goes
// through the same NUM() coercion and section narrowing.
export function toEngineLine(
  l: MigrationLineLike,
  opts: ToEngineLineOptions = {}
): MigrationDetailLine {
  return {
    id: l.id ?? opts.idDefault ?? "",
    section: parseMigrationSection(l.section),
    label: l.label,
    quantity: opts.quantityOverride ?? NUM(l.quantity),
    items_per_object: NUM(l.items_per_object),
    total_line_items: NUM(l.total_line_items),
    row_order: l.row_order ?? opts.rowOrderDefault ?? 0,
  };
}
