/**
 * Date helpers for content that is stored as text.
 *
 * past_events.event_date is a text column, and rows created before the admin
 * used a date picker hold free text like "October 5, 2025". These helpers let
 * new values be stored as ISO (so a date picker can round-trip them) without
 * breaking the older free-text rows.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Format a stored value for display.
 * ISO values are formatted; anything else is returned untouched, so legacy
 * free text still reads exactly as whoever typed it intended.
 */
export function formatDisplayDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!ISO_DATE.test(raw)) return raw;

  // Construct from parts rather than parsing the string, so the value is not
  // shifted a day by the local timezone.
  const [y, m, d] = raw.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const MONTH_NAME = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const DAY_NUMBER = /\b([1-9]|[12]\d|3[01])\b/;
const NUMERIC_DATE = /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/;

/**
 * Best-effort conversion of a stored value into the YYYY-MM-DD that
 * <input type="date"> requires. Returns '' when the value is not clearly a
 * full date, leaving the picker empty rather than inventing one.
 *
 * The shape check matters: `new Date()` does not reject vague input. It reads
 * "Autumn 2024" as 1 January 2024, so without this a loosely-worded legacy
 * value would silently become a specific — and wrong — date as soon as someone
 * opened that edition and pressed Save.
 */
export function toInputDate(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (ISO_DATE.test(raw)) return raw;

  const looksLikeFullDate =
    NUMERIC_DATE.test(raw) || (MONTH_NAME.test(raw) && DAY_NUMBER.test(raw));
  if (!looksLikeFullDate) return '';

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';

  const pad = (n) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/** Keep a year field to four digits, rejecting stray letters. */
export function sanitizeYear(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 4);
}
