// supabase/functions/_shared/razorpay.ts
//
// Shared by razorpay-order, razorpay-verify and razorpay-webhook. Folders that
// start with an underscore are not deployed as functions of their own; each
// function bundles what it imports from here.
//
// SECRETS (supabase secrets set ...)
//   RAZORPAY_KEY_ID          rzp_test_... or rzp_live_...  (Dashboard -> Account & Settings -> API Keys)
//   RAZORPAY_KEY_SECRET      shown once when the key is generated
//   RAZORPAY_WEBHOOK_SECRET  the secret you type when creating the webhook
//
// The key id is not secret -- Checkout needs it in the browser -- but it is
// served from here rather than baked into the frontend build, so switching
// from test keys to live keys is a `secrets set`, not a redeploy of the site.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { env, safeEqual } from './edge.ts';
import { metaCapiEnabled, runInBackground, sendMetaPurchase } from './metaCapi.ts';

// Re-exported so the razorpay-* functions keep importing everything from here.
export { CORS, ConfigError, UUID_RE, env, json, serviceClient } from './edge.ts';

/* ── Razorpay REST ──────────────────────────────────────────────────────── */

export class RazorpayError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export async function razorpay<T = Record<string, unknown>>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const auth = btoa(`${env('RAZORPAY_KEY_ID')}:${env('RAZORPAY_KEY_SECRET')}`);
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON error page */ }

  if (!response.ok) {
    const err = (data.error ?? {}) as { description?: string; code?: string };
    throw new RazorpayError(
      err.description || `Razorpay responded ${response.status}`,
      response.status,
      err.code,
    );
  }
  return data as T;
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method?: string;
  amount_refunded?: number;
  error_code?: string | null;
  error_description?: string | null;
}

/* ── Signatures ─────────────────────────────────────────────────────────── */

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Checkout's success signature: HMAC-SHA256(order_id + "|" + payment_id, key secret). */
export async function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const expected = await hmacSha256Hex(env('RAZORPAY_KEY_SECRET'), `${orderId}|${paymentId}`);
  return safeEqual(expected, signature.toLowerCase());
}

/**
 * Webhook signature: HMAC-SHA256 of the RAW request body with the webhook
 * secret. The body must be the exact bytes received -- parsing and
 * re-serialising it changes whitespace and key order, and the check fails.
 */
export async function verifyWebhookSignature(rawBody: string, signature: string) {
  const expected = await hmacSha256Hex(env('RAZORPAY_WEBHOOK_SECRET'), rawBody);
  return safeEqual(expected, signature.toLowerCase());
}

/* ── Settlement ─────────────────────────────────────────────────────────── */

/**
 * Make sure the money is actually ours, then record it.
 *
 * A payment Razorpay reports as `authorized` has not been collected. With the
 * dashboard's automatic capture on -- the recommended setting -- it moves to
 * `captured` within moments on its own. With capture left on manual, Razorpay
 * refunds an uncaptured payment automatically after a few days, and the
 * runner would find their entry quietly undone. Capturing here makes the
 * integration correct whichever setting the account has.
 *
 * Only a captured payment reaches confirm_payment().
 */
export async function settlePayment(admin: SupabaseClient, input: RazorpayPayment) {
  let payment = input;

  if (payment.currency !== 'INR') {
    return { status: 'UNSUPPORTED_CURRENCY' as const };
  }

  if (payment.status === 'authorized') {
    try {
      payment = await razorpay<RazorpayPayment>(`/payments/${payment.id}/capture`, {
        method: 'POST',
        body: { amount: payment.amount, currency: payment.currency },
      });
    } catch {
      // Most often: automatic capture, or the other path (callback/webhook),
      // got there first. Ask Razorpay what the payment is now.
      payment = await razorpay<RazorpayPayment>(`/payments/${payment.id}`);
    }
  }

  if (payment.status !== 'captured') {
    return { status: 'NOT_CAPTURED' as const, razorpayStatus: payment.status };
  }

  const { data, error } = await admin.rpc('confirm_payment', {
    p_order_id: payment.order_id,
    p_payment_id: payment.id,
    p_amount_paise: payment.amount,
    p_method: payment.method ?? null,
  });
  if (error) throw new Error(`confirm_payment failed: ${error.message}`);

  const summary = data as {
    status: 'PAID' | 'REFUND_REQUIRED' | 'UNKNOWN_ORDER' | string;
    payment_id?: string;
    registration?: Record<string, unknown> | null;
    group?: Record<string, unknown> | null;
  };

  // Server-side Purchase for Meta ads. Both razorpay-verify and the webhook
  // come through here; the shared event_id makes Meta count it once. Never
  // allowed to fail or delay the payment itself.
  if (summary?.status === 'PAID' && metaCapiEnabled()) {
    const settled = payment;
    await runInBackground((async () => {
      const order = await razorpay<{ notes?: Record<string, unknown> }>(`/orders/${settled.order_id}`);
      await sendMetaPurchase(admin, summary, settled, order.notes ?? {});
    })().catch((err) => console.error('Meta Conversions API:', (err as Error).message)));
  }

  return summary;
}
