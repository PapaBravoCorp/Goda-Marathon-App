import { previewCoupon } from './services/coupons';
import { isoDayBefore, formatShortDate } from './dates';

/**
 * The discount code a visitor gets without typing it.
 *
 * Two sources, in this order:
 *
 *   1. A link: /register?code=BTB20 (any page works). This is how a club or a
 *      company is given its own rate -- the captain shares one link.
 *   2. The event's featured code (events.featured_coupon_code, migration 0024,
 *      set in Admin -> Coupons -> "Show on site").
 *
 * Nothing here decides a price. Every figure comes from preview_coupon(), the
 * same database function the confirm step and the stored registration use, so
 * a card cannot advertise a price the checkout will not honour. A code that is
 * inactive, expired or used up quotes as invalid and is simply not shown.
 */

/**
 * Whether the event's featured code is applied for the runner (true) or only
 * shown with an Apply button (false). Admin -> Coupons -> "Site code"
 * (events.featured_coupon_auto_apply, migration 0026). A database without
 * the column reads as true, the behaviour before 0026. Link codes are applied
 * either way.
 */
export const featuredAutoApply = (event) => event?.featured_coupon_auto_apply !== false;

/**
 * Whether the registration form will apply this offer by itself: always for a
 * link code, and for the site's code only in auto-apply mode. Anywhere a price
 * is shown, the discounted figure is the price only when this is true;
 * otherwise it is what the runner gets after tapping Apply.
 */
export const offerIsApplied = (offer, event) =>
  !!offer && (offer.source === 'link' || featuredAutoApply(event));

const LINK_KEY = 'goda.linkCode';
const LINK_FRESH_KEY = 'goda.linkCodeFresh';

// The shape Admin -> Coupons allows. Anything else in a link is ignored
// rather than sent to the database.
const CODE_SHAPE = /^[A-Z0-9_-]{3,24}$/;

export const normaliseCode = (raw) => {
  const code = String(raw ?? '').trim().toUpperCase();
  return CODE_SHAPE.test(code) ? code : '';
};

const storage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null; // Storage blocked: the link code works on the landing page only.
  }
};

// Kept in memory too, so the code survives in-app navigation when storage is blocked.
let linkCodeInMemory = '';

/**
 * Remember a ?code= (or ?coupon=) from the address the visitor arrived on.
 * Called once at startup, before the first render, so it does not matter
 * which page the link pointed at or how they get to the form from there.
 * Kept for the tab's lifetime only: the next visit starts from the featured
 * code again unless the link is used again.
 */
export function captureLinkCode(search = window.location.search) {
  let code = '';
  try {
    const params = new URLSearchParams(search);
    code = normaliseCode(params.get('code') || params.get('coupon'));
  } catch {
    code = '';
  }
  if (!code) return '';

  linkCodeInMemory = code;
  const store = storage();
  try {
    store?.setItem(LINK_KEY, code);
    // "Fresh" lets the form tell a new arrival by link from a reload of a form
    // the runner has since edited. See takeFreshLinkCode().
    store?.setItem(LINK_FRESH_KEY, '1');
  } catch {
    // Full or blocked storage: the in-memory copy still serves this page load.
  }
  return code;
}

export function getLinkCode() {
  if (linkCodeInMemory) return linkCodeInMemory;
  try {
    return normaliseCode(storage()?.getItem(LINK_KEY));
  } catch {
    return '';
  }
}

/**
 * The link code, once, for the form the visitor lands on after following a
 * link. A link is a deliberate act and outranks whatever code a saved draft
 * holds; a later reload is not, and must not undo the runner's own edit.
 */
export function takeFreshLinkCode() {
  const store = storage();
  try {
    if (store?.getItem(LINK_FRESH_KEY) !== '1') return '';
    store.removeItem(LINK_FRESH_KEY);
  } catch {
    return '';
  }
  return getLinkCode();
}

/* ── Quotes ─────────────────────────────────────────────────────────────── */

// The same category is quoted by the homepage cards, the event page and the
// form within one visit. Short-lived, so an organiser's change to a code shows
// up without anyone having to reload twice.
const QUOTE_TTL_MS = 2 * 60 * 1000;
const quoteCache = new Map();

function quoteOne(code, eventId, categoryName, isGroup) {
  const key = `${eventId}|${code}|${isGroup ? 'G' : 'S'}|${categoryName}`;
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.at < QUOTE_TTL_MS) return hit.promise;

  const promise = previewCoupon(code, eventId, [categoryName], isGroup).then((quote) => {
    // A network failure is not an answer about the code; do not remember it.
    if (!quote || quote.reason === 'PREVIEW_FAILED') quoteCache.delete(key);
    return quote;
  });
  quoteCache.set(key, { at: Date.now(), promise });
  return promise;
}

/**
 * Quote one code against each category on its own.
 *
 * Returns { code, quotes, summary }: `quotes` maps category name to the
 * database's answer for a single entry in that category, and `summary` is
 * null when the code takes nothing off any of them.
 */
export async function quoteCategories(code, eventId, categoryNames, { isGroup = false } = {}) {
  const clean = normaliseCode(code);
  const names = [...new Set((categoryNames || []).filter(Boolean))];
  if (!clean || !eventId || names.length === 0) {
    return { code: clean, quotes: {}, summary: null };
  }

  const answers = await Promise.all(names.map(name => quoteOne(clean, eventId, name, isGroup)));
  const quotes = {};
  names.forEach((name, i) => { quotes[name] = answers[i]; });

  return { code: clean, quotes, summary: summariseQuotes(clean, quotes) };
}

const rupees = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

/** What a code does, in the words the strip and the cards use. */
export function summariseQuotes(code, quotes) {
  const all = Object.values(quotes || {});
  const good = all.filter(q => q?.valid && Number(q.discount) > 0);
  if (good.length === 0) return null;

  const first = good[0];
  const value = Number(first.discount_value) || 0;
  // A capped percentage ("20% off, up to Rs 300") would make "20% off" wrong
  // on the dearer categories, so the headline is only a percentage when every
  // category really gets that percentage. The cards show exact prices either way.
  const exactPercent = first.discount_type === 'PERCENT' && good.every((q) => {
    const eligible = Number(q.eligible_subtotal) || 0;
    return Math.trunc(eligible * value / 100) === Number(q.discount);
  });

  let label;
  if (first.discount_type === 'PERCENT' && exactPercent) label = `${value}% off`;
  else if (first.discount_type === 'FLAT') label = `${rupees(value)} off`;
  else label = `Up to ${rupees(Math.max(...good.map(q => Number(q.discount))))} off`;

  // The last day at this rate, and what comes after, for "until 29 Nov".
  // A scheduled change (0026) ends the current rate the day before it starts;
  // otherwise the code's own end date does.
  const nextValue = Number(first.next_discount_value) || 0;
  const until = first.next_discount_from
    ? isoDayBefore(first.next_discount_from)
    : (first.valid_until || '');
  let thenLabel = '';
  if (first.next_discount_from && nextValue > 0) {
    thenLabel = first.discount_type === 'PERCENT' ? `${nextValue}% off` : `${rupees(nextValue)} off`;
  }

  return {
    code: first.code || code,
    label,
    description: first.description || '',
    appliesToAll: good.length === all.length,
    until,
    thenLabel,
  };
}

/**
 * The deadline in words, or '' when the offer has none:
 * "until 29 Nov" or "until 29 Nov, then 10% off".
 */
export function offerDeadline(summary) {
  const day = formatShortDate(summary?.until);
  if (!day) return '';
  return summary.thenLabel ? `until ${day}, then ${summary.thenLabel}` : `until ${day}`;
}

/** The discounted price for one category under a set of quotes, or null. */
export function dealFor(quotes, categoryName, listPrice) {
  const quote = quotes?.[categoryName];
  if (!quote?.valid) return null;
  const discount = Number(quote.discount) || 0;
  if (discount <= 0) return null;
  const list = Number(listPrice) || 0;
  return { code: quote.code, discount, list, price: Math.max(list - discount, 0) };
}

/**
 * Which code to apply for a visitor who has not typed one.
 *
 * The link code if it takes something off at least one category, otherwise
 * the featured code on the same condition, otherwise nothing. A mistyped or
 * expired link therefore falls back to the public offer instead of leaving
 * the runner with a refused code they never entered.
 */
export async function resolveAutoOffer(event, categoryNames, { isGroup = false } = {}) {
  const eventId = event?.id;
  if (!eventId) return null;

  const candidates = [
    { code: getLinkCode(), source: 'link' },
    { code: normaliseCode(event?.featured_coupon_code), source: 'featured' },
  ].filter((c, i, list) => c.code && list.findIndex(o => o.code === c.code) === i);

  for (const candidate of candidates) {
    const result = await quoteCategories(candidate.code, eventId, categoryNames, { isGroup });
    if (result.summary) return { ...result, source: candidate.source };
  }
  return null;
}

/** For tests and the admin panel: forget every cached quote. */
export function clearQuoteCache() {
  quoteCache.clear();
}
