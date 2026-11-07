// Search, filters and CSV rows for the Runners tab. Pure functions: no
// Supabase, no React. Rows are what list_runners() returns (full phone,
// masked email, paid_entry) -- or, before migration 0027, what
// list_registrations_basic() returns, with the phone masked as phone_masked.

const STATUS_ORDER = ['PAID', 'PENDING', 'CANCELLED', 'REFUNDED'];

/** The visible last 4 digits of a masked phone ('******3210' -> '3210'), or ''. */
export function phoneLast4(masked) {
  const m = /(\d{4})$/.exec(masked || '');
  return m ? m[1] : '';
}

/** The phone as the row has it: full (0027) or masked (0023). */
export const rowPhone = (row) => row.phone ?? row.phone_masked ?? '';

/** The last ten digits of a phone, for matching however it was typed. */
const digits10 = (value) => String(value || '').replace(/\D/g, '').slice(-10);

/**
 * Does the row match what was typed in the search box? Matches the name, the
 * Razorpay payment ID, or the phone. With the full number (0027) any run of
 * its digits matches; with only the last 4 (0023), a full number typed in
 * matches on its last 4.
 */
export function matchesQuery(row, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  if ((row.name || '').toLowerCase().includes(q)) return true;
  if ((row.razorpay_payment_id || '').toLowerCase().includes(q)) return true;

  const compact = q.replace(/[\s+\-()]/g, '');
  if (row.phone != null) {
    const typed = compact.length > 10 ? digits10(compact) : compact;
    return /^\d+$/.test(typed) && digits10(row.phone).includes(typed);
  }
  const last4 = phoneLast4(row.phone_masked);
  if (last4 && /^\d+$/.test(compact)) {
    return compact.length <= 4 ? last4.includes(compact) : compact.endsWith(last4);
  }
  return false;
}

export function filterRunners(rows, { query = '', category = '', status = '' } = {}) {
  return rows.filter((r) =>
    (!category || r.category === category)
    && (!status || r.payment_status === status)
    && matchesQuery(r, query));
}

/** Filter choices present in the data: categories A–Z, statuses paid first. */
export function runnerFilterOptions(rows) {
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
  const statuses = [...new Set(rows.map((r) => r.payment_status).filter(Boolean))].sort((a, b) => {
    const ia = STATUS_ORDER.indexOf(a);
    const ib = STATUS_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  return { categories, statuses };
}

/** 'YYYY-MM-DD HH:mm' in Indian time: sorts correctly in a spreadsheet. */
export function formatIst(iso) {
  if (!iso) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export const RUNNER_CSV_HEADER = [
  'Name', 'Category', 'Entry type', 'Group', 'Payment status', 'Amount paid', 'Coupon code',
  'Razorpay payment ID', 'Registered at (IST)', 'Bib', 'T-shirt size', 'City',
  'Phone', 'Email (masked)', 'Paid in another entry',
];

/** Exactly the columns the database returned, email as masked there. */
export function runnerCsvRows(rows) {
  return rows.map((r) => [
    r.name, r.category, r.entry_type, r.group_name, r.payment_status, r.amount_paid,
    r.coupon_code, r.razorpay_payment_id, formatIst(r.registered_at), r.bib, r.tshirt_size,
    r.city, rowPhone(r), r.email_masked, r.paid_entry,
  ]);
}
