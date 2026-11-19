import { businessDateOf, isValidDateInput } from "@/lib/dates/business-day";

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

// The Chicago business day (D5) of a report value, as YYYY-MM-DD. Timestamps
// are converted to America/Chicago so the date shown matches the range filters
// and day counts; a bare DATE value (e.g. loe_signed_date) has no time zone
// and is kept as it is.
export function reportBusinessDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (BARE_DATE.test(value)) return isValidDateInput(value) ? value : null;
  return businessDateOf(value);
}

// Render report dates in the compact "DD MMM YY" form (e.g. "12 JAN 26")
// used across every on-screen report. XLSX exporters write real Date cells
// with numFmt "dd mmm yy" so Excel sort/filter still works — this helper is
// for the display-only surface.
export function formatDateShort(iso: string | null | undefined): string {
  const day = reportBusinessDay(iso);
  if (!day) return "—";
  const [yr, month, dd] = day.split("-");
  return `${dd} ${MONTHS[Number(month) - 1]} ${yr.slice(-2)}`;
}

// Report date → Date for XLSX cells: midnight UTC of the business day, which
// Excel (it has no time zones) shows as that same calendar day. Returns null
// for nulls/invalid so we can write "—" text cells instead. Callers should set
// cell.numFmt = "dd mmm yy".
export function toDateOrNull(iso: string | null | undefined): Date | null {
  const day = reportBusinessDay(iso);
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
