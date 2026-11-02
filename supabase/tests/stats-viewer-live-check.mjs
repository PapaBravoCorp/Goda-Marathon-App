// Post-deploy check of a stats viewer login against the LIVE project.
//
//   VIEWER_EMAIL=akash@example.com VIEWER_PASSWORD='...' node supabase/tests/stats-viewer-live-check.mjs
//
// Run it after migration 0022 is applied and a viewer has been added (README,
// "Stats viewers"). It proves, through the real API and the real policies,
// what run-db-tests.sh can only show on a local copy:
//
//   * a visitor who is not signed in cannot call get_reg_stats
//   * the viewer gets totals and nothing else
//   * the viewer reads no rows from registrations, registration_groups, coupons
//   * is_admin() is false for the viewer
//   * send-bulk-email refuses the viewer with 403
//
// Read-only. The send-bulk-email call has no subject or body, so even if the
// account were wrongly an admin the function would stop at validation (400)
// and send nothing. Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the
// environment or from .env. EVENT_ID is optional; the current event is used.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadDotEnv() {
  try {
    const text = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // No .env: rely on the environment.
  }
}

loadDotEnv();

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.VIEWER_EMAIL;
const password = process.env.VIEWER_PASSWORD;

if (!url || !anonKey || !email || !password) {
  console.error('Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VIEWER_EMAIL and VIEWER_PASSWORD.');
  process.exit(2);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
let failures = 0;

function check(passed, label, detail = '') {
  if (passed) {
    console.log(`ok - ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL - ${label}${detail ? ` (${detail})` : ''}`);
  }
}

const sameKeys = (obj, keys) =>
  obj && typeof obj === 'object' && JSON.stringify(Object.keys(obj).sort()) === JSON.stringify([...keys].sort());

// ── Not signed in ───────────────────────────────────────────────────────────
const anon = createClient(url, anonKey, options);

let eventId = process.env.EVENT_ID;
if (!eventId) {
  const { data } = await anon.from('events').select('id').eq('is_current', true).maybeSingle();
  eventId = data?.id || 'goda-2026';
}
console.log(`Event: ${eventId}`);

{
  const { data, error } = await anon.rpc('get_reg_stats', { p_event_id: eventId });
  check(Boolean(error) && !data, 'anon: get_reg_stats errors', error ? '' : 'it returned data');
}

// ── Signed in as the viewer ─────────────────────────────────────────────────
const viewer = createClient(url, anonKey, options);
const { data: signIn, error: signInError } = await viewer.auth.signInWithPassword({ email, password });
if (signInError) {
  console.error(`Could not sign in as ${email}: ${signInError.message}`);
  failures += 1;
} else try {
  {
    const { data, error } = await viewer.rpc('can_view_stats');
    check(!error && data === true, 'viewer: can_view_stats() is true',
      error?.message || `got ${data}; is the stats_viewers row there and active?`);
  }
  {
    const { data, error } = await viewer.rpc('is_admin');
    check(!error && data === false, 'viewer: is_admin() is false', error?.message || `got ${data}`);
  }
  {
    const { data, error } = await viewer.rpc('get_reg_stats', { p_event_id: eventId });
    const ok = !error
      && sameKeys(data, ['event_id', 'generated_at', 'breakdown', 'daily'])
      && Array.isArray(data.breakdown) && Array.isArray(data.daily)
      && data.breakdown.every((r) => sameKeys(r, ['coupon_code', 'category', 'payment_status', 'count']))
      && data.daily.every((r) => sameKeys(r, ['day', 'payment_status', 'count']));
    const total = ok ? data.breakdown.reduce((n, r) => n + r.count, 0) : 0;
    check(ok, `viewer: gets totals only (${total} entries across ${ok ? data.breakdown.length : 0} rows)`,
      error?.message || 'unexpected shape');
  }

  for (const table of ['registrations', 'registration_groups', 'coupons']) {
    const { data, error } = await viewer.from(table).select('*').limit(5);
    check(!error && Array.isArray(data) && data.length === 0, `viewer: select on ${table} returns []`,
      error ? error.message : `${data.length} row(s) came back`);
  }

  {
    const res = await fetch(`${url}/functions/v1/send-bulk-email`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${signIn.session.access_token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    check(res.status === 403, 'viewer: send-bulk-email answers 403', `got ${res.status}`);
  }
} finally {
  await viewer.auth.signOut();
}

console.log(failures ? `${failures} check(s) failed.` : 'All live checks passed.');
// exitCode, not process.exit(): exiting while fetch's sockets are still
// closing crashes Node on Windows (libuv assertion, exit 127).
process.exitCode = failures ? 1 : 0;
