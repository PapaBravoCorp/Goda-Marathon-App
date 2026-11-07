import { supabase } from '../supabaseClient';

/**
 * The registration activity log (migration 0025).
 *
 * The forms record every outcome here: a duplicate email stopped on the
 * details step, each submit that worked or failed (with the raw database
 * error), each payment result, each cancelled reservation. Organisers read it
 * in Admin -> Activity.
 *
 * A failed registration leaves no row anywhere else -- its transaction rolls
 * back -- so before this the only record of what went wrong was the console of
 * the runner's own phone.
 *
 * Logging must never get in the runner's way: every call here is
 * fire-and-forget, catches everything, and returns nothing the form waits on.
 * When the network itself is the problem, the entry waits in this browser and
 * goes out with the next successful call (or the next visit).
 */

const QUEUE_KEY = 'goda-registration-log-queue';
const CLIENT_KEY = 'goda-client-id';
const MAX_QUEUED = 25;
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const randomId = () => {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** A random id kept in this browser, so one person's attempts read together. */
const clientId = () => {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
};

const readQueue = () => {
  try {
    const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (!Array.isArray(list)) return [];
    const cutoff = Date.now() - MAX_QUEUE_AGE_MS;
    return list.filter(e => e && Date.parse(e.client_at) > cutoff);
  } catch {
    return [];
  }
};

const writeQueue = (list) => {
  try {
    if (list.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUED)));
  } catch { /* storage full or blocked: the entry is lost, the form is not */ }
};

/**
 * A fetch that never reached the server comes back from supabase-js as an
 * error with no PostgREST code ("TypeError: Failed to fetch", "Load failed").
 * Those are worth keeping for later; an error the server returned is not --
 * retrying it would fail the same way.
 */
const isNetworkError = (error) => !error?.code;

const send = async (entry) => {
  try {
    const { error } = await supabase.rpc('log_registration_event', { p: entry });
    if (!error) return 'sent';
    return isNetworkError(error) ? 'retry' : 'dropped';
  } catch {
    return 'retry';
  }
};

let flushing = false;

/** Send anything an earlier attempt could not. Safe to call any time. */
export const flushRegistrationLog = async () => {
  if (flushing) return;
  const queued = readQueue();
  if (queued.length === 0) return;
  flushing = true;
  try {
    const left = [];
    for (const entry of queued) {
      // Stop at the first network failure: the rest would fail too.
      if (left.length > 0) { left.push(entry); continue; }
      if ((await send(entry)) === 'retry') left.push(entry);
    }
    writeQueue(left);
  } finally {
    flushing = false;
  }
};

/**
 * The parts of an error worth keeping. The services wrap the database error
 * in a friendly one (`err.code` = our code such as UNKNOWN or CATEGORY_FULL,
 * `err.cause` = what PostgREST returned); a network failure has no cause.
 */
export const describeError = (err) => {
  if (!err) return {};
  const raw = err.cause && typeof err.cause === 'object' ? err.cause : null;
  return {
    code: err.code || null,
    error_message: raw?.message || err.message || String(err),
    error_sqlstate: raw?.code || null,
    error_details: raw?.details || null,
    error_hint: raw?.hint || null,
  };
};

/**
 * Record one event. Returns immediately; nothing to await or catch.
 *
 *   flow    'SOLO' | 'GROUP'
 *   stage   'DETAILS' | 'SUBMIT' | 'PAYMENT' | 'CANCEL'
 *   status  'OK' | 'FAILED' | 'ABANDONED' | 'INFO'
 *   code    short reason: UNKNOWN, CATEGORY_FULL, DECLINED, PAID ...
 *   person  { email, firstName, lastName, phone }
 *   error   an Error from the services (see describeError)
 *   context anything else small and useful, as an object
 */
export const logRegistrationEvent = ({
  eventId, flow, stage, status, code,
  person = {}, category, participantCount,
  registrationId, groupId, amount,
  error, shownMessage, context,
}) => {
  try {
    const described = error ? describeError(error) : {};
    const entry = {
      event_id: eventId,
      flow,
      stage,
      status,
      code: code || described.code || null,
      email: person.email || null,
      first_name: person.firstName || null,
      last_name: person.lastName || null,
      phone: person.phone || null,
      category: category || null,
      participant_count: participantCount ?? null,
      registration_id: registrationId || null,
      group_id: groupId || null,
      amount: amount ?? null,
      error_message: described.error_message || null,
      error_sqlstate: described.error_sqlstate || null,
      error_details: described.error_details || null,
      error_hint: described.error_hint || null,
      shown_message: shownMessage || null,
      client_id: clientId(),
      client_at: new Date().toISOString(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      page: typeof window !== 'undefined' ? window.location.pathname : null,
      context: {
        ...(context || {}),
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
        screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      },
    };

    (async () => {
      const result = await send(entry);
      if (result === 'retry') {
        writeQueue([...readQueue(), entry]);
      } else if (result === 'sent') {
        flushRegistrationLog();
      }
    })();
  } catch (err) {
    console.warn('Could not record registration activity', err);
  }
};

/**
 * How a payment outcome from usePayment() reads in the log. `paid` is the only
 * success; `processing` (UPI still settling) is neither; `unverified` and
 * `refund` are failures an organiser must look at, because money has most
 * likely moved.
 */
export const paymentLogFields = (outcome = {}) => {
  switch (outcome.outcome) {
    case 'paid': return { status: 'OK', code: 'PAID' };
    case 'dismissed': return { status: 'ABANDONED', code: 'CHECKOUT_CLOSED' };
    case 'failed': return { status: 'FAILED', code: 'DECLINED', shownMessage: outcome.message };
    case 'processing': return { status: 'INFO', code: 'PROCESSING', shownMessage: outcome.message };
    case 'unverified': return { status: 'FAILED', code: 'UNVERIFIED', shownMessage: outcome.message };
    case 'refund': return { status: 'FAILED', code: 'REFUND_REQUIRED', shownMessage: outcome.message };
    case 'error':
      return outcome.code === 'DISABLED'
        ? { status: 'INFO', code: 'ONLINE_PAYMENT_OFF', shownMessage: outcome.message }
        : {
            status: 'FAILED',
            // The payments service says UNKNOWN for anything it cannot name;
            // here that means the Razorpay window never opened.
            code: outcome.code && outcome.code !== 'UNKNOWN' ? outcome.code : 'CHECKOUT_DID_NOT_START',
            shownMessage: outcome.message,
          };
    default:
      return { status: 'INFO', code: String(outcome.outcome || 'UNKNOWN').toUpperCase(), shownMessage: outcome.message };
  }
};

/* ── Admin ──────────────────────────────────────────────────────────────── */

/**
 * One page of the log, newest first: `{ total, rows, summary }`. Each row
 * carries `has_live_entry` -- whether that email holds a live entry now.
 * Admin session required.
 */
export const getRegistrationLog = async (eventId, {
  status = null, stage = null, search = null, stuckOnly = false, limit = 100, offset = 0,
} = {}) => {
  const { data, error } = await supabase.rpc('admin_registration_log', {
    p_event_id: eventId,
    p_status: status || null,
    p_stage: stage || null,
    p_search: search?.trim() || null,
    p_stuck_only: !!stuckOnly,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '')) {
      const missing = new Error(
        'The activity log is not set up yet: apply supabase/migrations/0025_registration_log.sql in the Supabase SQL editor.'
      );
      missing.code = 'NOT_DEPLOYED';
      throw missing;
    }
    throw error;
  }
  return data || { total: 0, rows: [], summary: {} };
};
