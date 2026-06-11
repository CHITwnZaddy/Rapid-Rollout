// ─────────────────────────────────────────────────────────────
// Shared report configuration types.
//
// IMPORTANT: configs must stay plain JSON (no functions, no React
// elements). The long-term plan is a user-facing report builder where
// these configs are stored per-user in Supabase and fed to the same
// rendering/export engine the canned reports use. Anything that can't
// be JSON.stringify'd breaks that path.
// ─────────────────────────────────────────────────────────────

export type ReportColumnFormat =
  | "text"
  | "link" // text that links to hrefBase/{row[hrefKey]}
  | "badge" // proposal status badge
  | "date"
  | "integer"
  | "factor" // 0.00 fixed decimals
  | "currency"
  | "hours" // #,##0.00 — summable
  | "number";

export type ReportColumn = {
  /** Row object key this column reads. */
  key: string;
  /** Screen header label. */
  header: string;
  /** XLSX header label when it differs from the screen header. */
  xlsxHeader?: string;
  /** XLSX column width. */
  width: number;
  format: ReportColumnFormat;
  /** Bold the cell (screen and XLSX). */
  bold?: boolean;
  /** Include this column in the totals row (sums numeric values). */
  sum?: boolean;
  /** Render zero as "—" instead of $0.00 (currency/number columns). */
  dashWhenZero?: boolean;
  /** format: "link" — href is `${hrefBase}/${row[hrefKey]}`. */
  hrefBase?: string;
  hrefKey?: string;
};

export type ReportConfig = {
  /** Screen page title, e.g. "Proposal Log Report". */
  title: string;
  /** XLSX title row, e.g. "Rapid Rollout – Proposal Log". */
  xlsxTitle: string;
  /** XLSX worksheet name. */
  sheetName: string;
  /** Download file prefix, e.g. "proposal-log". */
  fileSlug: string;
  columns: ReportColumn[];
  /** Append a totals row summing every column with sum: true. */
  totalsRow?: boolean;
  /**
   * Group rows by this key (e.g. "status"): the XLSX gets a header row
   * per group and per-group subtotals; the screen table gets group
   * header rows.
   */
  groupBy?: string;
  /**
   * Where per-group subtotals render: in the group header row itself
   * ("header", e.g. Portfolio Value) or as a separate row after the
   * group ("footer"). Default: "footer".
   */
  groupTotals?: "header" | "footer";
  /** Render the group label as a status badge on screen. */
  groupLabelBadge?: boolean;
  /** Grand-total row label. Default: "Grand Total" (XLSX) / "Totals" (screen). */
  totalsLabel?: string;
  /**
   * Conditional row tinting: reads row[key] and applies the named tint
   * ("red" | "green") when it matches. Rows without a match keep the
   * default alternating fill. Used by Stale Proposals (stale → red,
   * fresh → green in the XLSX).
   */
  rowTint?: { key: string; tints: Record<string, "red" | "green"> };
};

/** One report row: plain data keyed by column key. */
export type ReportRowData = Record<string, string | number | null>;
