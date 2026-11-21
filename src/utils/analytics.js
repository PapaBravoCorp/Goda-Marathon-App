/**
 * Analytics: the site's own event names, forwarded to the Meta Pixel.
 *
 * Pages call trackEvent() with names that describe what happened on this site
 * ("registration_step_completed"). Each one goes to Meta exactly once:
 *
 *   - as a Meta *standard* event where one fits, so Ads Manager can optimise
 *     and build audiences on it (the table in META_STANDARD below);
 *   - otherwise as a *custom* event under a PascalCase version of the same
 *     name ("RegistrationValidationFailed"), usable in Events Manager for
 *     custom conversions and funnel checks.
 *
 * Three things are not driven by trackEvent():
 *   - PageView and ViewContent, sent by trackPageView() on every route change
 *     (this is a single-page app; the base code in index.html sends nothing);
 *   - Purchase and CompleteRegistration, sent by trackConversion() once an
 *     entry is actually confirmed, however that happened;
 *   - Contact and outbound clicks, picked up by initClickTracking().
 *
 * Nothing that identifies a runner is put in event parameters: no names,
 * emails, phones, dates of birth, cities or health details. Meta's own
 * Automatic Advanced Matching (switched on in Events Manager) and the
 * server-side Purchase in supabase/functions/_shared/metaCapi.ts handle
 * matching, both hashed.
 *
 * Every call is a no-op on /admin, when the pixel is blocked (ad blockers,
 * Brave, strict tracking protection), and in development unless the pixel
 * script loaded. Tracking never throws into the page.
 */

const CURRENCY = 'INR';
const SENT_KEY = 'goda-meta-conversions';

const onAdmin = () => window.location.pathname.startsWith('/admin');

function fbq(...args) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function' || onAdmin()) return;
  try {
    window.fbq(...args);
  } catch {
    /* tracking must never break the page */
  }
}

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** Drop undefined, null and empty values; Meta rejects some of them. */
const compact = (obj) => Object.fromEntries(
  Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
);

/** The parameters that are safe to forward on a custom event. */
const SAFE_KEYS = ['flow', 'step', 'category', 'code', 'source', 'reason', 'outcome', 'participants', 'discount', 'coupon'];

function safeParams(props) {
  const out = {};
  SAFE_KEYS.forEach((k) => {
    if (props[k] !== undefined && props[k] !== null && props[k] !== '') out[k] = props[k];
  });
  if (Array.isArray(props.fields)) out.fields = props.fields.join(',');
  return out;
}

/** A race entry, in the shape Meta's commerce events expect. */
function entryParams({ categories = [], value, numItems = 1, flow }) {
  const names = [...new Set(categories.filter(Boolean))];
  return compact({
    content_type: 'product',
    content_ids: names,
    content_name: names.join(', ') || undefined,
    content_category: flow === 'group' ? 'Group entry' : 'Individual entry',
    num_items: numItems,
    value: toNumber(value),
    currency: toNumber(value) !== undefined ? CURRENCY : undefined,
  });
}

/**
 * Site event -> Meta standard event. Return [eventName, params], or null to
 * send nothing to Meta for that particular call. Anything not listed here is
 * sent as a custom event.
 *
 * The funnel, top to bottom:
 *   PageView / ViewContent  any page / a key page (trackPageView)
 *   AddToCart               race and category chosen (solo step 1, group roster)
 *   Lead                    contact details entered (solo step 2, coordinator)
 *   InitiateCheckout        Razorpay Checkout opened
 *   Purchase                payment confirmed (trackConversion)
 *   CompleteRegistration    entry confirmed, paid or offline (trackConversion)
 */
const META_STANDARD = {
  // Covered by ViewContent on /register and /register/group.
  registration_started: () => null,
  group_registration_started: () => null,

  registration_step_completed: (p) => {
    if (p.step === 1) {
      return ['AddToCart', entryParams({ categories: [p.category], value: p.value, flow: 'solo' })];
    }
    if (p.step === 2) {
      return ['Lead', entryParams({ categories: [p.category], value: p.value, flow: 'solo' })];
    }
    return undefined;
  },

  group_step_completed: (p) => {
    if (p.step === 1) return ['Lead', { content_category: 'Group entry' }];
    if (p.step === 2) {
      return ['AddToCart', entryParams({
        categories: p.categories, value: p.value, numItems: p.participants, flow: 'group',
      })];
    }
    return undefined;
  },

  payment_started: (p) => ['InitiateCheckout', entryParams({
    categories: p.categories, value: p.amount, numItems: p.participants || 1, flow: p.flow,
  })],

  // Sent by trackConversion() instead, which also covers a payment confirmed
  // by "check again", by the webhook before the page heard, or found already
  // paid when cancelling. Sending it here as well would count it twice.
  payment_completed: () => null,

  newsletter_subscribed: () => ['Subscribe', { content_name: 'Newsletter' }],
};

const toCustomName = (eventName) => eventName
  .split(/[_\s-]+/)
  .filter(Boolean)
  .map(w => w[0].toUpperCase() + w.slice(1))
  .join('');

export const trackEvent = (eventName, properties = {}) => {
  if (import.meta.env.DEV) {
    console.log(`%c[Analytics Event] %c${eventName}`, 'color: #3b82f6; font-weight: bold', 'color: #a855f7', properties);
  }

  const map = META_STANDARD[eventName];
  const standard = map ? map(properties) : undefined;

  if (standard === null) return;
  if (standard) {
    fbq('track', standard[0], standard[1]);
    return;
  }
  fbq('trackCustom', toCustomName(eventName), safeParams(properties));
};

/* ── Pages ─────────────────────────────────────────────────────────────── */

/** Pages that also count as ViewContent: interest worth building audiences on. */
const VIEW_CONTENT = {
  '/event': { content_name: 'Event details', content_category: 'Event' },
  '/register': { content_name: 'Individual registration', content_category: 'Registration' },
  '/register/group': { content_name: 'Group registration', content_category: 'Registration' },
  '/past-events': { content_name: 'Past events', content_category: 'Event' },
  '/results': { content_name: 'Results', content_category: 'Event' },
};

let lastPath = null;

/**
 * Call on every route change. Repeats for the same path are ignored, so
 * React's development double-render and a query-string change do not count
 * twice.
 */
export function trackPageView(pathname) {
  if (pathname === lastPath) return;
  lastPath = pathname;
  if (pathname.startsWith('/admin')) return;

  fbq('track', 'PageView');
  const content = VIEW_CONTENT[pathname.replace(/\/+$/, '') || '/'];
  if (content) fbq('track', 'ViewContent', content);
}

/* ── Conversions ───────────────────────────────────────────────────────── */

function alreadySent(id) {
  try {
    return (JSON.parse(localStorage.getItem(SENT_KEY)) || []).includes(id);
  } catch {
    return false;
  }
}

function markSent(id) {
  try {
    const sent = JSON.parse(localStorage.getItem(SENT_KEY)) || [];
    localStorage.setItem(SENT_KEY, JSON.stringify([...sent, id].slice(-50)));
  } catch {
    /* storage blocked: at worst a reload could repeat the event */
  }
}

/**
 * An entry is confirmed. Call it whenever that becomes true; it sends once per
 * entry (per browser), so calling it again after a reload or a re-render is
 * harmless.
 *
 *   paid: true   Purchase + CompleteRegistration (online payment landed)
 *   paid: false  CompleteRegistration only (online payment off; the
 *                organisers collect the money themselves)
 *
 * The Purchase eventID matches the one the server sends through the
 * Conversions API (`purchase_<entry id>`), so Meta counts the two as one.
 */
export function trackConversion({ id, flow = 'solo', paid, value, numItems = 1, categories = [] }) {
  if (!id || alreadySent(id)) return;
  markSent(id);

  const params = entryParams({ categories, value: toNumber(value) ?? 0, numItems, flow });
  if (paid) fbq('track', 'Purchase', params, { eventID: `purchase_${id}` });
  fbq('track', 'CompleteRegistration', { ...params, status: paid ? 'paid' : 'pending' }, { eventID: `registration_${id}` });
}

/* ── Clicks ────────────────────────────────────────────────────────────── */

let clickTrackingOn = false;

/**
 * One listener for the whole site, so links added later (footer contacts
 * edited in Admin -> Website, the success screen's email link) are covered
 * without touching each one.
 *   tel:, mailto:, WhatsApp      -> Contact
 *   any other site's link        -> custom OutboundClick
 */
export function initClickTracking() {
  if (clickTrackingOn || typeof document === 'undefined') return;
  clickTrackingOn = true;

  document.addEventListener('click', (e) => {
    const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!link) return;
    const href = link.getAttribute('href') || '';

    let method = null;
    if (href.startsWith('tel:')) method = 'phone';
    else if (href.startsWith('mailto:')) method = 'email';
    else if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(href)) method = 'whatsapp';

    if (method) {
      fbq('track', 'Contact', { method });
      return;
    }

    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin && /^https?:$/.test(url.protocol)) {
        fbq('trackCustom', 'OutboundClick', { destination: url.hostname });
      }
    } catch {
      /* not a URL */
    }
  }, { capture: true });
}

/* ── For the server-side Purchase ──────────────────────────────────────── */

const readCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
};

/**
 * The browser's Meta identifiers and the page, sent with the payment order so
 * the server-side Purchase can be matched to the same person and deduplicated
 * against this browser's own Purchase. Empty when the pixel is blocked.
 */
export function getMetaBrowserContext() {
  try {
    return compact({
      fbp: readCookie('_fbp'),
      fbc: readCookie('_fbc'),
      url: window.location.href.split('?')[0],
    });
  } catch {
    return {};
  }
}
