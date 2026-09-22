// supabase/functions/send-bulk-email/index.ts
//
// The admin panel has always had an Email tab, and it has never worked: it
// invoked an edge function named `send-bulk-email` that was never written.
// Calling it returns 404, so every send was logged FAILED and no participant
// ever received anything.
//
// This is that function.
//
// It must run server-side for two reasons that are not negotiable:
//
//   * the mail provider's API key is a real secret and cannot be shipped to a
//     browser, unlike the Supabase anon key which is public by design;
//   * after migration 0006 the browser cannot read public.registrations at
//     all, so the recipient list can only be assembled here, with the
//     service_role key.
//
// DEPLOY
//   supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM="GODA Trail Run <noreply@yourdomain.com>"
//   supabase functions deploy send-bulk-email
//
// The sending domain must be verified with the provider first, or everything
// will land in spam. Until the secrets are set the function returns a clear
// error and the admin panel shows it, rather than silently doing nothing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Resend caps a single call at 100 recipients, so send in batches. */
const BATCH_SIZE = 100;
/** Courtesy pause between batches, to stay under the provider's rate limit. */
const BATCH_PAUSE_MS = 1100;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const MAIL_FROM = Deno.env.get('MAIL_FROM');

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: 'Function is misconfigured: Supabase environment variables are missing.' }, 500);
  }
  if (!RESEND_API_KEY || !MAIL_FROM) {
    return json({
      error:
        'Email is not configured yet. Set RESEND_API_KEY and MAIL_FROM with ' +
        '`supabase secrets set`, then redeploy this function.',
    }, 503);
  }

  // ── 1. The caller must be a signed-in admin ───────────────────────────────
  // Checked here rather than trusted from the client: this function holds the
  // service_role key, so an unauthenticated caller would otherwise be able to
  // mail every participant.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Not signed in.' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: 'Not signed in.' }, 401);

  const { data: adminRow } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (!adminRow) return json({ error: 'You do not have permission to send email.' }, 403);

  // ── 2. Read the request ───────────────────────────────────────────────────
  let payload: {
    subject?: string;
    body?: string;
    recipientFilter?: { type?: string; category?: string; status?: string };
    eventId?: string;
    logId?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Request body was not valid JSON.' }, 400);
  }

  const subject = (payload.subject ?? '').trim();
  const body = (payload.body ?? '').trim();
  if (!subject || !body) return json({ error: 'Subject and body are both required.' }, 400);

  // ── 3. Build the recipient list ───────────────────────────────────────────
  let query = admin
    .from('registrations')
    .select('email, first_name, last_name, bib, category, payment_status')
    .neq('payment_status', 'CANCELLED');

  if (payload.eventId) query = query.eq('event_id', payload.eventId);

  const filter = payload.recipientFilter ?? {};
  if (filter.type === 'category' && filter.category) query = query.eq('category', filter.category);
  if (filter.type === 'status' && filter.status) query = query.eq('payment_status', filter.status);

  const { data: recipients, error: recipientError } = await query;
  if (recipientError) {
    return json({ error: `Could not load recipients: ${recipientError.message}` }, 500);
  }

  // One message per address, even if somebody appears twice.
  const seen = new Set<string>();
  const list = (recipients ?? []).filter((r) => {
    const key = (r.email ?? '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (list.length === 0) return json({ error: 'No recipients match that filter.' }, 400);

  // ── 4. Send ───────────────────────────────────────────────────────────────
  // Addresses go in BCC so participants never see each other's email --
  // disclosing the entrant list to every entrant would be a data breach in
  // itself.
  const htmlBody = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:600px">
${escapeHtml(body).replace(/\n/g, '<br>')}
</div>`;

  let sent = 0;
  const failures: string[] = [];

  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = list.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: MAIL_FROM,
          to: [MAIL_FROM],
          bcc: batch.map((r) => r.email),
          subject,
          text: body,
          html: htmlBody,
        }),
      });

      if (!response.ok) {
        failures.push(`batch ${i / BATCH_SIZE + 1}: ${await response.text()}`);
      } else {
        sent += batch.length;
      }
    } catch (err) {
      failures.push(`batch ${i / BATCH_SIZE + 1}: ${(err as Error).message}`);
    }

    if (i + BATCH_SIZE < list.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    }
  }

  // ── 5. Record what actually happened ──────────────────────────────────────
  // The client updates the log too, but it only knows whether the call threw.
  // The real counts are here.
  if (payload.logId) {
    await admin
      .from('email_log')
      .update({
        status: failures.length === 0 ? 'SENT' : sent > 0 ? 'SENT' : 'FAILED',
        recipient_count: sent,
        error_message: failures.length ? failures.join(' | ').slice(0, 2000) : null,
      })
      .eq('id', payload.logId);
  }

  if (sent === 0) {
    return json({ error: `Nothing was sent. ${failures.join(' | ')}` }, 502);
  }

  return json({
    sent,
    attempted: list.length,
    partial: failures.length > 0,
    errors: failures,
  });
});
