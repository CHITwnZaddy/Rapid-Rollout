/**
 * Business-day helpers.
 *
 * The business runs on Chicago time. Date-range filters, dashboard presets and
 * day counts all use the America/Chicago calendar day, so a deal closed at
 * 11:30 PM on March 31 in Chicago belongs to Q1 even though it is already
 * April 1 in UTC.
 *
 * These helpers use Intl only (no date library) and never read the process
 * time zone, so they give the same answer on the server (UTC on Vercel) and in
 * the browser (wherever the user is).
 */

export const BUSINESS_TIME_ZONE = "America/Chicago";

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

let zonedFormatter: Intl.DateTimeFormat | undefined;

function getZonedFormatter(): Intl.DateTimeFormat {
  // hourCycle "h23" rather than hour12: false, which can format midnight as "24".
  zonedFormatter ??= new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return zonedFormatter;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock parts of `date` in the business time zone. `date` must be valid. */
function zonedPartsOf(date: Date): ZonedParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};
  for (const part of getZonedFormatter().formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function parseDateInput(value: string): [number, number, number] {
  const [y, m, d] = value.split("-").map(Number);
  return [y, m, d];
}

/**
 * True when `value` is a real calendar date written as YYYY-MM-DD.
 * Rejects impossible dates such as 2026-02-30 and 2026-13-01.
 */
export function isValidDateInput(value: string): boolean {
  if (!DATE_INPUT_PATTERN.test(value)) return false;
  const [y, m, d] = parseDateInput(value);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value;
}

/** Adds whole calendar days to a YYYY-MM-DD date. */
export function addDaysToDateInput(value: string, days: number): string {
  const [y, m, d] = parseDateInput(value);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The Chicago calendar date (YYYY-MM-DD) of an instant, or null when the value
 * cannot be parsed.
 */
export function businessDateOf(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  // Check before calling Intl: formatToParts throws RangeError on an Invalid Date.
  if (Number.isNaN(date.getTime())) return null;
  const { year, month, day } = zonedPartsOf(date);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** Milliseconds the business time zone is ahead of UTC at instant `t`. */
function businessOffsetMs(t: number): number {
  const z = zonedPartsOf(new Date(t));
  return (
    Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second) -
    Math.floor(t / 1000) * 1000
  );
}

/**
 * The UTC instant (ISO string) of midnight at the start of a Chicago calendar
 * day. Chicago changes its clocks at 02:00, so local midnight always exists and
 * is unambiguous.
 */
export function startOfBusinessDayUtc(value: string): string {
  if (!isValidDateInput(value)) {
    throw new Error(`Invalid date filter: ${value}`);
  }
  const [y, m, d] = parseDateInput(value);
  const guess = Date.UTC(y, m - 1, d);
  const firstOffset = businessOffsetMs(guess);
  let utc = guess - firstOffset;
  const secondOffset = businessOffsetMs(utc);
  if (secondOffset !== firstOffset) utc = guess - secondOffset;
  return new Date(utc).toISOString();
}

/**
 * UTC bounds for an inclusive range of Chicago calendar days: `gte` is the
 * start of `dateFrom` and `lt` is the start of the day after `dateTo`. Missing
 * or empty bounds are left out.
 */
export function businessDayBoundsUtc(
  dateFrom?: string,
  dateTo?: string
): { gte?: string; lt?: string } {
  const bounds: { gte?: string; lt?: string } = {};
  if (dateFrom) {
    bounds.gte = startOfBusinessDayUtc(dateFrom);
  }
  if (dateTo) {
    // Validate the user's value first so the error names it, not the day after.
    if (!isValidDateInput(dateTo)) {
      throw new Error(`Invalid date filter: ${dateTo}`);
    }
    bounds.lt = startOfBusinessDayUtc(addDaysToDateInput(dateTo, 1));
  }
  return bounds;
}

/**
 * Signed number of Chicago calendar days from `start` to `end`. Counts date
 * changes, not 24-hour periods, so daylight-saving days do not skew it.
 * Returns null when either value cannot be parsed.
 */
export function businessCalendarDaysBetween(
  start: string | Date,
  end: string | Date
): number | null {
  const a = businessDateOf(start);
  const b = businessDateOf(end);
  if (a === null || b === null) return null;
  return (
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY
  );
}
