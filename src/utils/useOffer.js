import { useEffect, useMemo, useState } from 'react';
import { normaliseCode, quoteCategories, resolveAutoOffer } from './offer';

const namesOf = (categories) =>
  (categories || []).map(c => (typeof c === 'string' ? c : c?.name)).filter(Boolean);

/**
 * The offer to apply for a visitor who has not typed a code: the link code or
 * the event's featured code (see offer.js).
 *
 * `ready` turns true once the answer is known, including "there is none", so
 * a caller can tell "still asking" from "no offer" and avoid flashing the list
 * price before the discounted one.
 */
export function useAutoOffer(event, categories, { isGroup = false } = {}) {
  const eventId = event?.id || '';
  const featured = event?.featured_coupon_code || '';
  // A string key, so a categories array rebuilt on every render does not
  // restart the request.
  const namesKey = namesOf(categories).join('\u0001');
  const requestKey = `${eventId}|${featured}|${isGroup ? 'G' : 'S'}|${namesKey}`;

  // Stored with the request it answers, so a changed request reads as "not
  // ready" straight away instead of showing the previous answer.
  const [answer, setAnswer] = useState({ key: '', offer: null });

  useEffect(() => {
    if (!eventId || !namesKey) return undefined;

    let stale = false;
    resolveAutoOffer({ id: eventId, featured_coupon_code: featured }, namesKey.split('\u0001'), { isGroup })
      .then((offer) => { if (!stale) setAnswer({ key: requestKey, offer }); })
      .catch(() => { if (!stale) setAnswer({ key: requestKey, offer: null }); });

    return () => { stale = true; };
  }, [eventId, featured, namesKey, isGroup, requestKey]);

  const settled = answer.key === requestKey;
  return useMemo(
    () => ({ ready: settled, offer: settled ? answer.offer : null }),
    [settled, answer.offer]
  );
}

/**
 * Per-category quotes for a code the runner is typing. Debounced, because the
 * field changes a character at a time and each category is a round trip.
 *
 * `ready` is false while a request for the current code is outstanding.
 */
export function useCodeQuotes(code, eventId, categories, { delay = 400 } = {}) {
  const clean = normaliseCode(code);
  const namesKey = namesOf(categories).join('\u0001');
  const requestKey = `${eventId || ''}|${clean}|${namesKey}`;
  const [answer, setAnswer] = useState({ key: '', result: null });

  useEffect(() => {
    if (!clean || !eventId || !namesKey) return undefined;

    let stale = false;
    const timer = setTimeout(() => {
      quoteCategories(clean, eventId, namesKey.split('\u0001'))
        .then((result) => { if (!stale) setAnswer({ key: requestKey, result }); })
        .catch(() => { if (!stale) setAnswer({ key: requestKey, result: null }); });
    }, delay);

    return () => { stale = true; clearTimeout(timer); };
  }, [clean, eventId, namesKey, delay, requestKey]);

  const nothingToAsk = !clean || !eventId || !namesKey;
  const settled = nothingToAsk || answer.key === requestKey;
  const result = !nothingToAsk && answer.key === requestKey ? answer.result : null;

  return useMemo(
    () => ({
      ready: settled,
      code: clean,
      quotes: result?.quotes || {},
      summary: result?.summary || null,
    }),
    [settled, clean, result]
  );
}
