// Turns the counts from get_reg_stats() into the tables on the Stats page and
// the rows of its CSV. Pure functions: no Supabase, no React.
//
// "Entries" means paid + pending everywhere on the page. Every other status
// (cancelled, refunded) is counted separately and never in entries.

export const NO_CODE_LABEL = 'No code';
const NOT_SET_LABEL = 'Not set';

const bucketOf = (status) => {
  if (status === 'PAID') return 'paid';
  if (status === 'PENDING') return 'pending';
  return 'cancelled';
};

function tally(map, key, label, status, count) {
  let row = map.get(key);
  if (!row) {
    row = { key, label, paid: 0, pending: 0, cancelled: 0 };
    map.set(key, row);
  }
  row[bucketOf(status)] += count;
}

const withEntries = (row) => ({ ...row, entries: row.paid + row.pending });

// Busiest first; ties alphabetical, so the order does not jump between refreshes.
const byEntries = (a, b) => b.entries - a.entries || a.label.localeCompare(b.label);

/**
 * @param stats the object returned by get_reg_stats(), or null
 * @returns {{ totals, byCategory, byCode, byDay, maxDayEntries, isEmpty }}
 */
export function summariseStats(stats) {
  const breakdown = Array.isArray(stats?.breakdown) ? stats.breakdown : [];
  const daily = Array.isArray(stats?.daily) ? stats.daily : [];

  const totals = { paid: 0, pending: 0, cancelled: 0 };
  const categories = new Map();
  const codes = new Map();
  const days = new Map();

  for (const r of breakdown) {
    totals[bucketOf(r.payment_status)] += r.count;
    tally(categories, r.category || '', r.category || NOT_SET_LABEL, r.payment_status, r.count);
    tally(codes, r.coupon_code || '', r.coupon_code || NO_CODE_LABEL, r.payment_status, r.count);
  }
  for (const r of daily) {
    tally(days, r.day, r.day, r.payment_status, r.count);
  }

  const byCategory = [...categories.values()].map(withEntries).sort(byEntries);
  // Real codes by use; entries without a code go last.
  const byCode = [...codes.values()].map(withEntries).sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1;
    return byEntries(a, b);
  });
  // Newest day first: today's numbers are what people open the page for.
  const byDay = [...days.values()].map(withEntries).sort((a, b) => b.key.localeCompare(a.key));

  return {
    totals: withEntries(totals),
    byCategory,
    byCode,
    byDay,
    maxDayEntries: byDay.reduce((max, d) => Math.max(max, d.entries), 0),
    isEmpty: breakdown.length === 0,
  };
}

export const STATS_CSV_HEADER = ['Section', 'Date', 'Coupon code', 'Category', 'Payment status', 'Count'];

/**
 * The CSV rows: every count the database returned, nothing derived and nothing
 * per runner. Long format so it filters and pivots cleanly in a spreadsheet.
 */
export function statsCsvRows(stats) {
  const breakdown = Array.isArray(stats?.breakdown) ? stats.breakdown : [];
  const daily = Array.isArray(stats?.daily) ? stats.daily : [];
  return [
    ...breakdown.map((r) => [
      'Breakdown', '', r.coupon_code || NO_CODE_LABEL, r.category || NOT_SET_LABEL, r.payment_status, r.count,
    ]),
    ...daily.map((r) => ['Daily', r.day, '', '', r.payment_status, r.count]),
  ];
}
