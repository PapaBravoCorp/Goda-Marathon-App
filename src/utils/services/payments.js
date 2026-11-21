import { supabase } from '../supabaseClient';
import { getMetaBrowserContext } from '../analytics';

/**
 * Online payment through Razorpay Standard Checkout.
 *
 * The browser never decides what is charged. It reserves an entry through
 * create_registration() / create_group_registration() exactly as before, then
 * asks the razorpay-order edge function for an order against that
 * reservation's id; the function reads the amount from the stored row.
 * Checkout opens for that order, and on success the razorpay-verify function
 * checks Razorpay's signature and re-fetches the payment before the entry is
 * marked PAID. A webhook does the same independently, so an entry is still
 * confirmed if the runner closes the tab straight after paying.
 *
 * Nothing here is secret. The Razorpay key id arrives from the edge function
 * with each order, so switching from test to live keys needs no rebuild.
 */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const PENDING_KEY = 'goda-pending-payment';

/** The event row decides; the column exists once migration 0011 is applied. */
export const isOnlinePaymentEnabled = (event) => event?.online_payment_enabled === true;

/* ── Checkout script ────────────────────────────────────────────────────── */

let checkoutPromise = null;

/**
 * Load checkout.js once, on demand. Loading it on every page would hand a
 * third-party script to visitors who never pay; loading it at the moment of
 * payment costs a fraction of a second behind a spinner.
 */
export const loadCheckout = () => {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutPromise) return checkoutPromise;

  checkoutPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Checkout did not initialise.')));
    script.onerror = () => reject(new Error('Could not load the payment window.'));
    document.head.appendChild(script);
  }).catch((err) => {
    // Let the next attempt try again rather than replaying the same failure --
    // a flaky mobile connection is the usual cause.
    checkoutPromise = null;
    throw err;
  });

  return checkoutPromise;
};

/* ── Edge function calls ────────────────────────────────────────────────── */

/**
 * supabase.functions.invoke() turns every non-2xx response into a generic
 * FunctionsHttpError and leaves the body unread in `error.context`. The body
 * carries the specific reason ("your reservation expired"), so read it.
 */
async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data;

  let payload = null;
  try {
    payload = await error.context?.json?.();
  } catch { /* not JSON */ }

  const err = new Error(
    payload?.error
      || (/fetch|network/i.test(error.message || '')
        ? 'Could not reach the payment server. Check your connection and try again.'
        : 'The payment service is unavailable right now. Please try again shortly.')
  );
  err.code = payload?.status || (error.context?.status === 404 ? 'NOT_DEPLOYED' : 'UNKNOWN');
  err.paymentId = payload?.paymentId;
  if (err.code === 'NOT_DEPLOYED') {
    console.error(`The ${name} edge function is not deployed. See README -> Payments.`);
  }
  throw err;
}

// `meta` carries the browser's Meta Pixel identifiers so the server-side
// Purchase (supabase/functions/_shared/metaCapi.ts) matches this visitor and
// is deduplicated against the browser's own. It is optional and never priced.
export const createPaymentOrder = ({ registrationId, groupId }) =>
  invoke('razorpay-order', {
    ...(registrationId ? { registrationId } : { groupId }),
    meta: getMetaBrowserContext(),
  });

export const verifyPayment = (response) =>
  invoke('razorpay-verify', {
    razorpay_order_id: response.razorpay_order_id,
    razorpay_payment_id: response.razorpay_payment_id,
    razorpay_signature: response.razorpay_signature,
  });

/* ── The payment itself ─────────────────────────────────────────────────── */

/**
 * Create the order, open Checkout, and settle.
 *
 * Resolves -- never rejects for an outcome the runner caused -- with one of:
 *   { outcome: 'paid', result }            confirmed; result has the entry
 *   { outcome: 'dismissed' }               closed the window without paying
 *   { outcome: 'failed', message }         Razorpay declined, then they closed it
 *   { outcome: 'processing', ... }         paid, bank still confirming (UPI)
 *   { outcome: 'unverified', ... }         paid, but our check could not run
 *   { outcome: 'refund', message, ... }    paid, but the entry could not take it
 *
 * Rejects only when payment could not start at all (order refused, script
 * blocked), with `err.code` from the edge function -- EXPIRED in particular.
 */
export const payForEntry = async ({ registrationId, groupId, prefill = {}, dueAt, onOpen, onVerifying }) => {
  const order = await createPaymentOrder({ registrationId, groupId });

  // The webhook got there first, or a retry in another tab already paid.
  if (order.status === 'PAID') return { outcome: 'paid', result: null };

  const Razorpay = await loadCheckout();

  // Close Checkout a minute before the reservation lapses, so nobody starts a
  // payment for a place that is about to be released under them.
  const deadline = dueAt || order.dueAt;
  const secondsLeft = deadline ? Math.floor((new Date(deadline).getTime() - Date.now()) / 1000) - 60 : null;
  if (secondsLeft !== null && secondsLeft < 60) {
    const err = new Error('Your reservation is about to expire. Please register again.');
    err.code = 'EXPIRED';
    throw err;
  }

  return new Promise((resolve) => {
    let lastFailure = null;
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };

    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: order.name || 'GODA Epic Trail Run',
      description: order.description,
      prefill: {
        name: prefill.name || undefined,
        email: prefill.email || undefined,
        contact: prefill.contact || undefined,
      },
      theme: { color: '#F26B0C' }, // brand orange; Razorpay's own dialog, outside our light/dark theming
      ...(secondsLeft !== null ? { timeout: secondsLeft } : {}),
      // Let the runner try another card or UPI app inside the same window
      // rather than dumping them back on our page after one decline.
      retry: { enabled: true },
      modal: {
        confirm_close: true,
        ondismiss: () => finish(lastFailure
          ? { outcome: 'failed', message: lastFailure }
          : { outcome: 'dismissed' }),
      },
      handler: async (response) => {
        onVerifying?.();
        try {
          const result = await verifyPayment(response);
          if (result?.status === 'PROCESSING') {
            finish({ outcome: 'processing', response, paymentId: result.paymentId, message: result.error });
          } else {
            finish({ outcome: 'paid', result });
          }
        } catch (err) {
          finish(err.code === 'REFUND_REQUIRED'
            ? { outcome: 'refund', message: err.message, paymentId: err.paymentId || response.razorpay_payment_id }
            : { outcome: 'unverified', message: err.message, response, paymentId: response.razorpay_payment_id });
        }
      },
    });

    rzp.on('payment.failed', (resp) => {
      lastFailure = resp?.error?.description || 'The payment was declined.';
    });

    rzp.open();
    onOpen?.();
  });
};

/**
 * Ask again after an 'unverified' or 'processing' outcome. verify is
 * idempotent, so this is safe to call as often as the runner presses it.
 */
export const recheckPayment = async (response) => {
  try {
    const result = await verifyPayment(response);
    if (result?.status === 'PROCESSING') {
      return { outcome: 'processing', response, paymentId: result.paymentId, message: result.error };
    }
    return { outcome: 'paid', result };
  } catch (err) {
    if (err.code === 'REFUND_REQUIRED') {
      return { outcome: 'refund', message: err.message, paymentId: err.paymentId };
    }
    return { outcome: 'unverified', message: err.message, response, paymentId: response.razorpay_payment_id };
  }
};

/**
 * Release an unpaid reservation at the runner's request (migration 0012).
 *
 * Returns the database's answer rather than throwing for the expected ones:
 *   CANCELLED   released (or already gone) -- back to the form
 *   NOT_FOUND   nothing to release -- back to the form
 *   PAID        the payment landed first -- show the confirmation instead
 *   NOT_CANCELLABLE / CANCEL_AS_GROUP -- explain, stay put
 * Throws only when the call itself fails.
 */
export const cancelReservation = async ({ registrationId, groupId }) => {
  const { data, error } = await supabase.rpc('cancel_reservation', {
    p_registration_id: registrationId || null,
    p_group_id: groupId || null,
  });

  if (error) {
    const missing = error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '');
    if (missing) {
      console.error('cancel_reservation() is missing. Apply supabase/migrations/0012_cancel_reservation.sql.');
    }
    const err = new Error(missing
      ? 'Cancelling is not available right now. Your reservation will be released automatically when the timer runs out.'
      : 'Could not cancel just now. Check your connection and try again.');
    err.code = missing ? 'NOT_DEPLOYED' : 'UNKNOWN';
    throw err;
  }
  return data;
};

/* ── Surviving a reload ─────────────────────────────────────────────────── */

/**
 * A reservation made but not yet paid, remembered in this browser.
 *
 * Without it, a runner who reloads or comes back to the tab after the payment
 * window closed would find an empty form -- and their email refused as
 * already registered until the reservation lapsed. With it, they land back on
 * the payment step. It holds only what the page already had: the reservation
 * the database returned and the name/email/phone used to prefill Checkout.
 */
export const savePendingPayment = (kind, data) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ kind, ...data }));
  } catch { /* private mode or storage full: resume is a convenience */ }
};

export const loadPendingPayment = (kind) => {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.kind !== kind) return null;
    if (!data.dueAt || new Date(data.dueAt).getTime() <= Date.now()) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

export const clearPendingPayment = () => {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
};

/* ── Admin ──────────────────────────────────────────────────────────────── */

/**
 * Payments that arrived for an entry that could not take them -- flagged
 * REFUND_REQUIRED by confirm_payment(), with the reason in `note`. These need
 * a human: refund from the Razorpay dashboard, or reinstate the entry.
 * Admin session required.
 */
export const getPaymentIssues = async (eventId) => {
  try {
    let query = supabase
      .from('payments')
      .select('id, razorpay_payment_id, razorpay_order_id, amount_paise, note, created_at, paid_at')
      .eq('status', 'REFUND_REQUIRED')
      .order('created_at', { ascending: false });
    if (eventId) query = query.eq('event_id', eventId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (error) {
    // Before migration 0011 the table does not exist; that is not an issue to
    // show, just nothing to show.
    if (!/does not exist|schema cache/i.test(error?.message || '')) {
      console.error('Error fetching payment issues', error);
    }
    return [];
  }
};
