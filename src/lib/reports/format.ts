const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

// Render ISO timestamps in the compact "DD MMM YY" form (e.g. "12 JAN 26")
// used across every on-screen report. XLSX exporters write real Date cells
// with numFmt "dd mmm yy" so Excel sort/filter still works — this helper is
// for the display-only surface.
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const mon = MONTHS[d.getMonth()];
  const yr = String(d.getFullYear()).slice(-2);
  return `${day} ${mon} ${yr}`;
}

// ISO → Date for XLSX cells. Returns null for nulls/invalid so we can
// write "—" text cells instead. Callers should set cell.numFmt = "dd mmm yy".
export function toDateOrNull(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
