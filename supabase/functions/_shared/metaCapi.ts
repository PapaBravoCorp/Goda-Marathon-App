// supabase/functions/_shared/metaCapi.ts
//
// Server-side Purchase for Meta ads (the Conversions API), sent when a payment
// is confirmed. The browser pixel already sends a Purchase from the success
// screen; this one exists for what the browser misses:
//   - a runner who pays and closes the tab before the page hears back
//     (razorpay-webhook confirms the entry, and sends this);
//   - visitors whose browser blocks the pixel (ad blockers, Brave, Safari's
//     tracking protection);
//   - matching. The pixel cannot be given the runner's email and phone in
//     this single-page app (Meta only takes them at fbq('init'), before the
//     form is filled in); this sends them, SHA-256 hashed.
//
// Both carry the same event_id (`purchase_<entry id>`), so Meta counts one
// Purchase, not two. razorpay-verify and razorpay-webhook may both send it for
// the same payment; the shared event_id deduplicates that too.
//
// Optional. With META_CAPI_ACCESS_TOKEN unset nothing here runs, nothing is
// collected, and payments behave exactly as before. A failure here is logged
// and never affects the payment or the response.
//
// SECRETS (npm run supabase -- secrets set ...)
//   META_PIXEL_ID            1690222886147383
//   META_CAPI_ACCESS_TOKEN   Events Manager -> the pixel -> Settings ->
//                            Conversions API -> Generate access token
//   META_TEST_EVENT_CODE     optional; e.g. TEST12345 from Events Manager ->
//                            Test events. Unset it again after testing, or
//                            real purchases are reported as test events.
//   META_GRAPH_VERSION       optional; defaults to GRAPH_VERSION below
//
// What is sent: hashed email, phone, first and last name, city, state, PIN
// code and country of the runner (or the group coordinator); the browser's
// IP address, user agent and Meta cookies (_fbp, _fbc) captured when Checkout
// opened; the amount paid and the categories. Never the date of birth,
// gender, emergency contact or anything medical.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Marketing API versions retire roughly a year after release; the Conversions
// API follows them. v26.0 was released on 29 July 2026.
const GRAPH_VERSION = 'v26.0';
const TIMEOUT_MS = 4000;

export function metaCapiEnabled(): boolean {
  return !!Deno.env.get('META_CAPI_ACCESS_TOKEN') && !!Deno.env.get('META_PIXEL_ID');
}

/* ── Browser context, stored on the Razorpay order ─────────────────────── */

// Razorpay order notes: at most 15 keys, 256 characters per value.
const NOTE_MAX = 256;
const FB_COOKIE_RE = /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_.\-]{1,200}$/;
const IP_RE = /^[0-9a-fA-F:.]{3,45}$/;

/**
 * What razorpay-order keeps on the order so the Purchase can be matched later,
 * even when it is the webhook (which has no browser) that confirms it.
 * Returns nothing at all while the Conversions API is not configured.
 */
export function browserContextNotes(
  req: Request,
  meta: { fbp?: unknown; fbc?: unknown; url?: unknown } | undefined,
): Record<string, string> {
  if (!metaCapiEnabled()) return {};

  const notes: Record<string, string> = {};
  const fbp = typeof meta?.fbp === 'string' ? meta.fbp.trim() : '';
  const fbc = typeof meta?.fbc === 'string' ? meta.fbc.trim() : '';
  const url = typeof meta?.url === 'string' ? meta.url.trim() : '';

  if (FB_COOKIE_RE.test(fbp)) notes.meta_fbp = fbp;
  if (FB_COOKIE_RE.test(fbc)) notes.meta_fbc = fbc;
  if (/^https:\/\/[^\s]+$/.test(url) && url.length <= NOTE_MAX) notes.meta_url = url;

  const ua = (req.headers.get('user-agent') ?? '').trim();
  if (ua) notes.meta_ua = ua.slice(0, NOTE_MAX);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (IP_RE.test(ip)) notes.meta_ip = ip;

  return notes;
}

/* ── Normalising and hashing, as Meta specifies ────────────────────────── */

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
/** Lowercase, letters and digits only: Meta's form for names, city and state. */
const squash = (v: unknown) => lower(v).normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');

function indianPhone(v: unknown): string {
  const digits = typeof v === 'string' ? v.replace(/\D/g, '') : '';
  return digits.length >= 10 ? `91${digits.slice(-10)}` : '';
}

async function hashed(value: string): Promise<string[] | undefined> {
  return value ? [await sha256(value)] : undefined;
}

/* ── The Purchase ──────────────────────────────────────────────────────── */

interface PaymentSummary {
  status: string;
  amount_paise?: number;
  registration?: Record<string, unknown> | null;
  group?: Record<string, unknown> | null;
}

interface Person {
  email?: string; phone?: string; first?: string; last?: string;
  city?: string; state?: string; pincode?: string;
}

async function loadEntry(admin: SupabaseClient, summary: PaymentSummary) {
  const registrationId = summary.registration?.id as string | undefined;
  const groupId = summary.group?.group_id as string | undefined;

  if (registrationId) {
    const { data, error } = await admin
      .from('registrations')
      .select('email, phone, first_name, last_name, city, state, pincode, category')
      .eq('id', registrationId)
      .single();
    if (error) throw new Error(`registration lookup: ${error.message}`);
    return {
      id: registrationId,
      person: {
        email: data.email, phone: data.phone, first: data.first_name, last: data.last_name,
        city: data.city, state: data.state, pincode: data.pincode,
      } as Person,
      categories: [data.category].filter(Boolean) as string[],
      numItems: 1,
    };
  }

  if (groupId) {
    const [{ data: g, error }, { data: members }] = await Promise.all([
      admin
        .from('registration_groups')
        .select('captain_email, captain_phone, captain_first_name, captain_last_name, city, state, pincode, participant_count')
        .eq('id', groupId)
        .single(),
      admin.from('registrations').select('category').eq('group_id', groupId),
    ]);
    if (error) throw new Error(`group lookup: ${error.message}`);
    return {
      id: groupId,
      person: {
        email: g.captain_email, phone: g.captain_phone, first: g.captain_first_name, last: g.captain_last_name,
        city: g.city, state: g.state, pincode: g.pincode,
      } as Person,
      categories: [...new Set((members ?? []).map((m: { category: string }) => m.category).filter(Boolean))],
      numItems: g.participant_count || members?.length || 1,
    };
  }

  return null;
}

/**
 * Send one Purchase for a confirmed payment. Resolves without throwing for
 * anything expected (not configured, no entry); throws only for an outright
 * failure, which the caller logs.
 */
export async function sendMetaPurchase(
  admin: SupabaseClient,
  summary: PaymentSummary,
  payment: { id: string; order_id: string; amount: number },
  notes: Record<string, unknown>,
): Promise<void> {
  if (!metaCapiEnabled() || summary.status !== 'PAID') return;

  const entry = await loadEntry(admin, summary);
  if (!entry) return;

  const note = (k: string) => (typeof notes[k] === 'string' ? (notes[k] as string) : undefined);
  const userAgent = note('meta_ua');
  const p = entry.person;

  const userData = Object.fromEntries(Object.entries({
    em: await hashed(lower(p.email)),
    ph: await hashed(indianPhone(p.phone)),
    fn: await hashed(squash(p.first)),
    ln: await hashed(squash(p.last)),
    ct: await hashed(squash(p.city)),
    st: await hashed(squash(p.state)),
    zp: await hashed(lower(p.pincode).replace(/\s/g, '')),
    country: await hashed('in'),
    client_ip_address: note('meta_ip'),
    client_user_agent: userAgent,
    fbp: note('meta_fbp'),
    fbc: note('meta_fbc'),
  }).filter(([, v]) => v !== undefined));

  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: `purchase_${entry.id}`,
    // Meta requires a user agent for a 'website' event. An order created
    // before this was deployed has none, and is reported as 'other'.
    action_source: userAgent ? 'website' : 'other',
    ...(userAgent && note('meta_url') ? { event_source_url: note('meta_url') } : {}),
    user_data: userData,
    custom_data: {
      currency: 'INR',
      value: Math.round(payment.amount) / 100,
      content_type: 'product',
      content_ids: entry.categories,
      num_items: entry.numItems,
      order_id: payment.order_id,
    },
  };

  const version = Deno.env.get('META_GRAPH_VERSION') || GRAPH_VERSION;
  const pixelId = Deno.env.get('META_PIXEL_ID')!;
  const token = Deno.env.get('META_CAPI_ACCESS_TOKEN')!;
  const testCode = Deno.env.get('META_TEST_EVENT_CODE');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event], ...(testCode ? { test_event_code: testCode } : {}) }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      // The body names the problem: an expired token, a wrong pixel id, a
      // retired API version.
      throw new Error(`Graph API ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Let the work finish after the response is sent where the runtime allows it
 * (Supabase's EdgeRuntime.waitUntil), so a slow Meta never slows a payment
 * confirmation. Elsewhere, wait for it; it is capped by TIMEOUT_MS.
 */
export async function runInBackground(task: Promise<unknown>): Promise<void> {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof runtime?.waitUntil === 'function') {
    runtime.waitUntil(task);
    return;
  }
  await task;
}
