// supabase/functions/razorpay-order/index.ts
//
// Step 2 of the payment flow: the browser has just reserved an entry and needs
// a Razorpay order to open Checkout against.
//
// The request carries only the reservation's id. What it costs is read from
// the stored row by prepare_payment(), so the amount charged is the amount the
// database priced -- a figure posted from the browser is a figure the browser
// can edit.
//
// Called by anonymous visitors, so it is deployed with --no-verify-jwt. That
// is safe because it can do nothing but create an order for an entry that is
// already reserved and unpaid, identified by an unguessable UUID that only the
// person who made the reservation has. It returns no personal data.
//
// DEPLOY
//   npm run supabase -- functions deploy razorpay-order --no-verify-jwt

import {
  CORS, ConfigError, RazorpayError, UUID_RE,
  env, json, razorpay, serviceClient,
} from '../_shared/razorpay.ts';
import { browserContextNotes } from '../_shared/metaCapi.ts';

/** Each status prepare_payment() can return, as an HTTP answer. */
const REFUSALS: Record<string, [number, string]> = {
  BAD_REQUEST: [400, 'Send exactly one of registrationId or groupId.'],
  NOT_FOUND: [404, 'That registration could not be found.'],
  PAY_AS_GROUP: [409, 'This runner is part of a group entry. The group coordinator pays for the whole group.'],
  DISABLED: [409, 'Online payment is not switched on for this event. The organisers will contact you with payment instructions.'],
  NOT_PAYABLE: [409, 'This registration is no longer awaiting payment.'],
  EXPIRED: [410, 'Your reservation expired before payment was completed, and the place has been released. Please register again.'],
  NOTHING_DUE: [409, 'There is nothing to pay for this registration. The organisers will confirm it.'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { registrationId?: string; groupId?: string; meta?: { fbp?: unknown; fbc?: unknown; url?: unknown } };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body was not valid JSON.' }, 400);
  }

  const registrationId = body.registrationId && UUID_RE.test(body.registrationId) ? body.registrationId : null;
  const groupId = body.groupId && UUID_RE.test(body.groupId) ? body.groupId : null;
  if (!registrationId === !groupId) {
    return json({ error: REFUSALS.BAD_REQUEST[1], status: 'BAD_REQUEST' }, 400);
  }

  try {
    const keyId = env('RAZORPAY_KEY_ID');
    const admin = serviceClient();

    const { data: prep, error: prepError } = await admin.rpc('prepare_payment', {
      p_registration_id: registrationId,
      p_group_id: groupId,
    });
    if (prepError) throw new Error(`prepare_payment failed: ${prepError.message}`);

    if (prep.status === 'PAID') return json({ status: 'PAID' });

    if (prep.status !== 'PAYABLE') {
      const [code, message] = REFUSALS[prep.status] ?? [409, 'This registration cannot be paid for online.'];
      return json({ status: prep.status, error: message }, code);
    }

    let orderId: string = prep.order_id;

    if (!orderId) {
      const order = await razorpay<{ id: string }>('/orders', {
        method: 'POST',
        body: {
          amount: prep.amount_paise,
          currency: prep.currency,
          receipt: prep.receipt,
          // Shown against the payment in the Razorpay dashboard, so an
          // organiser looking at a payment there can find the entry here.
          notes: {
            event_id: prep.event_id,
            ...(registrationId ? { registration_id: registrationId } : { group_id: groupId }),
            reference: prep.receipt,
            // The browser's Meta identifiers, IP and user agent, so the
            // server-side Purchase can be matched even when the webhook
            // confirms the payment. Empty unless the Conversions API is
            // configured (see _shared/metaCapi.ts).
            ...browserContextNotes(req, body.meta),
          },
        },
      });
      orderId = order.id;

      const { error: recordError } = await admin.rpc('record_payment_order', {
        p_registration_id: registrationId,
        p_group_id: groupId,
        p_event_id: prep.event_id,
        p_order_id: orderId,
        p_amount_paise: prep.amount_paise,
      });
      if (recordError) throw new Error(`record_payment_order failed: ${recordError.message}`);
    }

    return json({
      status: 'PAYABLE',
      keyId,
      orderId,
      amount: prep.amount_paise,
      currency: prep.currency,
      name: prep.event_name,
      description: prep.description,
      dueAt: prep.due_at,
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error('razorpay-order misconfigured:', err.message);
      return json({
        status: 'NOT_CONFIGURED',
        error: 'Online payment is not configured yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET with `supabase secrets set`.',
      }, 503);
    }
    if (err instanceof RazorpayError) {
      // 401 here means the key id and secret do not belong together, or a
      // test key is being used against live mode or vice versa.
      console.error('Razorpay order creation failed:', err.status, err.code, err.message);
      return json({ status: 'GATEWAY_ERROR', error: 'The payment gateway could not start this payment. Please try again in a moment.' }, 502);
    }
    console.error('razorpay-order failed:', (err as Error).message);
    return json({ status: 'ERROR', error: 'Something went wrong starting the payment. Please try again.' }, 500);
  }
});
