import { supabase } from '../supabaseClient';

/**
 * Discount coupons.
 *
 * The table is admin-only. Migration 0010 gives the anon role no privilege on
 * it at all, because a readable coupons table means every code is public the
 * day it is created -- the anon key ships inside the JavaScript bundle.
 *
 * The public therefore gets exactly one function, preview_coupon(), which
 * answers about a single code the visitor already typed. There is deliberately
 * no endpoint that lists codes.
 */

const TABLE_NAME = 'coupons';

/** What a refusal means, in words the person entering the code can act on. */
const COUPON_REASONS = {
  NO_CODE: '',
  NO_PARTICIPANTS: 'Add participants before applying a code.',
  COUPON_NOT_FOUND: 'That code is not recognised.',
  COUPON_INACTIVE: 'That code is no longer active.',
  COUPON_NOT_STARTED: 'That code is not valid yet.',
  COUPON_EXPIRED: 'That code has expired.',
  COUPON_EXHAUSTED: 'That code has reached its usage limit.',
  COUPON_GROUP_ONLY: 'That code applies to group entries only.',
  COUPON_SOLO_ONLY: 'That code cannot be used on a group entry.',
  COUPON_MIN_PARTICIPANTS: 'That code needs more participants to apply.',
  COUPON_CATEGORY_NOT_ELIGIBLE: 'That code does not apply to the categories you have chosen.',
};

/**
 * Turn the database's refusal reason into a sentence, filling in the numbers
 * the raw code leaves out ("needs 5 participants" rather than "needs more").
 */
export const describeCouponReason = (quote) => {
  if (!quote || quote.valid) return '';
  const reason = quote.reason;

  if (reason === 'COUPON_MIN_PARTICIPANTS' && quote.min_participants) {
    return `That code applies to groups of ${quote.min_participants} or more.`;
  }
  if (reason === 'COUPON_GROUP_ONLY' && quote.min_participants > 1) {
    return `That code applies to group entries of ${quote.min_participants} or more.`;
  }
  if (reason === 'COUPON_NOT_STARTED' && quote.valid_from) {
    const from = new Date(quote.valid_from).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    return `That code is not valid until ${from}.`;
  }
  if (reason === 'COUPON_CATEGORY_NOT_ELIGIBLE' && Array.isArray(quote.applies_to_categories)) {
    return `That code applies only to: ${quote.applies_to_categories.join(', ')}.`;
  }

  return COUPON_REASONS[reason] ?? 'That code could not be applied.';
};

/**
 * Quote a code against a basket before anything is submitted.
 *
 * `categories` is one category name per participant, not a unique list: the
 * discount depends on how many people are entering and what each of them is
 * running, so ["10K", "10K", "Half"] and ["10K", "Half"] are different baskets.
 *
 * Returns the quote as given by the database. The discount shown here is the
 * discount that will be stored -- both come from evaluate_coupon(), so the
 * confirm screen cannot disagree with the row.
 */
export const previewCoupon = async (code, eventId, categories, isGroup = false) => {
  const trimmed = (code || '').trim();
  if (!trimmed) return null;

  try {
    const { data, error } = await supabase.rpc('preview_coupon', {
      p_code: trimmed,
      p_event_id: eventId,
      p_categories: categories,
      p_is_group: isGroup,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error previewing coupon', error);
    // A network failure must not read as "your code is invalid". The caller
    // shows nothing, and the entry still goes through at full price -- the
    // database re-evaluates the code on submit regardless.
    return { valid: false, reason: 'PREVIEW_FAILED' };
  }
};

/* ── Admin ──────────────────────────────────────────────────────────────── */

/** Coupons for an event, each with how much it has actually given away. */
export const getCoupons = async (eventId) => {
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const coupons = data || [];
    if (coupons.length === 0) return coupons;

    const { data: usage } = await supabase.rpc('get_coupon_usage', { p_event_id: eventId });
    const byId = new Map((usage || []).map(u => [u.coupon_id, u]));

    return coupons.map(c => {
      const u = byId.get(c.id);
      return {
        ...c,
        redemptions: u?.redemptions ?? c.uses ?? 0,
        participants_covered: u?.participants ?? 0,
        discount_given: Number(u?.discount_given ?? 0),
      };
    });
  } catch (error) {
    console.error('Error fetching coupons', error);
    return [];
  }
};

export const addCoupon = async (couponData) => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert([{ ...couponData, updated_by: 'admin' }])
    .select()
    .single();
  if (error) {
    console.error('Error adding coupon', error);
    throw error;
  }
  return data;
};

export const updateCoupon = async (id, updates) => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ ...updates, updated_at: new Date().toISOString(), updated_by: 'admin' })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Error updating coupon', error);
    throw error;
  }
  return data;
};

/**
 * Deactivate rather than delete.
 *
 * `uses` is the audit trail for a code that has already given money away, and
 * registrations point at the code by name. Deleting the row would leave those
 * entries referencing something that cannot be looked up when an organiser
 * asks why a runner paid less than the list price.
 */
export const deactivateCoupon = async (id) => updateCoupon(id, { is_active: false });

export const deleteCoupon = async (id) => {
  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
  if (error) {
    console.error('Error deleting coupon', error);
    throw error;
  }
  return true;
};
