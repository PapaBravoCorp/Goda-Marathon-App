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

/**
 * "2025-03-02" → "March 2025", for a timeline where the day adds nothing.
 * Free text is returned untouched, as in formatDisplayDate.
 */
export function formatMonthYear(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!ISO_DATE.test(raw)) return raw;

  const [y, m] = raw.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
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

/** "2026-08-09" → "AUG 09, 2026", as the homepage hero shows the race date. */
export function formatHeroDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const month = d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase();
  const day = String(d.getDate()).padStart(2, '0');
  return `${month} ${day}, ${d.getFullYear()}`;
}

/**
 * Combine the event date with its flag-off time into a value the countdown can
 * parse. Left in local time deliberately — the race starts at 06:45 in Nashik,
 * not 06:45 UTC.
 */
export function buildCountdownTarget(dateStr, flagOff) {
  if (!dateStr) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((flagOff || '').trim());
  if (!match) return `${dateStr}T00:00:00`;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  return `${dateStr}T${String(hours).padStart(2, '0')}:${minutes}:00`;
}

/* ── India dates ─────────────────────────────────────────────────────────── */

/**
 * Today's date in India as YYYY-MM-DD, whatever the browser's timezone.
 *
 * Coupon dates are India dates (migration 0026 checks them against India
 * time), so the admin panel and the site compare against the same day the
 * database does.
 */
export function indiaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** "2026-11-30" → "2026-11-29". */
export function isoDayBefore(value) {
  if (!ISO_DATE.test(String(value || ''))) return '';
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1));
  return date.toISOString().slice(0, 10);
}

/** "2026-11-29" → "29 Nov", for deadlines on the site and in the admin. */
export function formatShortDate(value) {
  if (!ISO_DATE.test(String(value || ''))) return '';
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
