import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Trash2, Edit3, Tag, Power, TrendingDown, Megaphone, Link2, Check, CalendarClock } from 'lucide-react';

import { getCoupons, addCoupon, updateCoupon, deactivateCoupon, deleteCoupon } from '../../utils/services/coupons';
import { getEventCategories } from '../../utils/services/categories';
import { getEventById, updateEvent } from '../../utils/services/events';
import { clearQuoteCache } from '../../utils/offer';
import { describeSaveError } from '../../utils/services/errors';
import { indiaToday, isoDayBefore, formatShortDate } from '../../utils/dates';

const SCOPES = [
  { value: 'ANY', label: 'Anywhere', hint: 'Individual and group entries' },
  { value: 'GROUP_ONLY', label: 'Group entries only', hint: 'Hidden from the individual form' },
  { value: 'SOLO_ONLY', label: 'Individual entries only', hint: 'Cannot be used on a group' },
];

const formatPrice = (p) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(p) || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

/**
 * A code's scheduled change (migration 0026), relative to today in India:
 * null when none is set, otherwise whether it has happened yet.
 */
const scheduleOf = (c) => {
  if (c?.next_discount_value == null || !c?.next_discount_from) return null;
  return { value: Number(c.next_discount_value), from: c.next_discount_from, done: indiaToday() >= c.next_discount_from };
};

const valueText = (type, value) =>
  type === 'PERCENT' ? `${Number(value)}%` : formatPrice(value);

/**
 * Discount codes.
 *
 * `registrations.coupon_code` has existed since the first migration, but until
 * 0010 nothing read it: the form said "checked by the organisers" and someone
 * worked the discount out by hand at payment time. These rows are what the
 * database now prices entries against.
 */
export default function CouponManager({ eventId }) {
  const [coupons, setCoupons] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  // The one code advertised on the site (events.featured_coupon_code, 0024).
  const [featuredCode, setFeaturedCode] = useState('');
  // How the site offers it (events.featured_coupon_auto_apply, 0026). A
  // database without the column behaves as "apply automatically".
  const [autoApply, setAutoApply] = useState(true);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const emptyForm = {
    code: '', description: '',
    discount_type: 'PERCENT', discount_value: '', max_discount: '',
    min_participants: 1, scope: 'ANY',
    applies_to_categories: [],
    valid_from: '', valid_until: '',
    next_discount_from: '', next_discount_value: '',
    max_uses: '', is_active: true,
  };
  const [formData, setFormData] = useState(emptyForm);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, cats, ev] = await Promise.all([
        getCoupons(eventId),
        getEventCategories(eventId, eventId),
        getEventById(eventId),
      ]);
      setCoupons(list);
      setCategories(cats);
      setFeaturedCode((ev?.featured_coupon_code || '').toUpperCase());
      setAutoApply(ev?.featured_coupon_auto_apply !== false);
    } catch (err) {
      setFormError(describeSaveError(err, 'coupons'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleInput = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setFormError('');
  };

  const toggleCategory = (name) => {
    setFormData(prev => ({
      ...prev,
      applies_to_categories: prev.applies_to_categories.includes(name)
        ? prev.applies_to_categories.filter(c => c !== name)
        : [...prev.applies_to_categories, name],
    }));
  };

  const isFeatured = (c) => !!featuredCode && c.code.toUpperCase() === featuredCode;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const code = formData.code.trim().toUpperCase();
    if (!code) { setFormError('A code is required.'); return; }
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
      setFormError('Use 3–24 letters, digits, hyphens or underscores. Runners type this by hand.');
      return;
    }

    const value = parseFloat(formData.discount_value);
    if (!value || value <= 0) { setFormError('Enter a discount greater than zero.'); return; }
    if (formData.discount_type === 'PERCENT' && value > 100) {
      setFormError('A percentage discount cannot exceed 100.');
      return;
    }

    if (formData.valid_from && formData.valid_until
        && formData.valid_from > formData.valid_until) {
      setFormError('The start date is after the end date.');
      return;
    }

    // Scheduled change: both fields or neither.
    const nextFrom = formData.next_discount_from || '';
    const nextValue = formData.next_discount_value === '' ? null : parseFloat(formData.next_discount_value);
    const hasSchedule = !!nextFrom || nextValue != null;
    if (hasSchedule) {
      if (!nextFrom || nextValue == null) {
        setFormError('A scheduled change needs both a date and a new value. Clear both to remove it.');
        return;
      }
      if (!(nextValue > 0)) { setFormError('The scheduled value must be greater than zero.'); return; }
      if (formData.discount_type === 'PERCENT' && nextValue > 100) {
        setFormError('The scheduled percentage cannot exceed 100.');
        return;
      }
      if (formData.valid_until && nextFrom > formData.valid_until) {
        setFormError('The scheduled change is after the code stops working (Valid Until), so it would never happen.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        event_id: eventId,
        code,
        description: formData.description.trim() || null,
        discount_type: formData.discount_type,
        discount_value: value,
        max_discount: formData.discount_type === 'PERCENT' && formData.max_discount
          ? parseFloat(formData.max_discount) : null,
        min_participants: parseInt(formData.min_participants, 10) || 1,
        scope: formData.scope,
        // An empty selection means every category, which is stored as NULL --
        // not as an empty array, which would match nothing and silently make
        // the code worthless.
        applies_to_categories: formData.applies_to_categories.length > 0
          ? formData.applies_to_categories : null,
        valid_from: formData.valid_from || null,
        valid_until: formData.valid_until || null,
        max_uses: formData.max_uses ? parseInt(formData.max_uses, 10) : null,
        is_active: !!formData.is_active,
      };

      // Sent only when used or already on the row, so editing a code still
      // works on a database that has not had migration 0026 yet.
      const before = editingId ? coupons.find(c => c.id === editingId) : null;
      if (hasSchedule || (before && 'next_discount_value' in before)) {
        payload.next_discount_from = hasSchedule ? nextFrom : null;
        payload.next_discount_value = hasSchedule ? nextValue : null;
      }

      if (editingId) {
        await updateCoupon(editingId, payload);
        // The site finds the featured code by its text, so a rename has to
        // carry over or the offer silently disappears from the site.
        if (before && isFeatured(before) && before.code.toUpperCase() !== code) {
          await updateEvent(eventId, { featured_coupon_code: code });
        }
      } else {
        await addCoupon(payload);
      }
      setFormData(emptyForm);
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err) {
      // 23505 is the per-event unique index on upper(code).
      if (err?.code === '23505') {
        setFormError(`"${code}" already exists for this event.`);
      } else {
        setFormError(describeSaveError(err, 'coupon'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (c) => {
    setFormData({
      code: c.code,
      description: c.description || '',
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      max_discount: c.max_discount ?? '',
      min_participants: c.min_participants ?? 1,
      scope: c.scope || 'ANY',
      applies_to_categories: c.applies_to_categories || [],
      valid_from: c.valid_from || '',
      valid_until: c.valid_until || '',
      next_discount_from: c.next_discount_from || '',
      next_discount_value: c.next_discount_value ?? '',
      max_uses: c.max_uses ?? '',
      is_active: c.is_active,
    });
    setEditingId(c.id);
    setShowForm(true);
    setFormError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
    setFormError('');
  };

  /**
   * Show this code on the site, or stop showing it. One code at a time:
   * choosing another replaces the current one.
   *
   * This is the only thing that makes a code public. The site still asks the
   * database what the code is worth before showing anything, so a featured
   * code that expires or is deactivated just stops appearing.
   */
  const handleToggleFeatured = async (c) => {
    const next = isFeatured(c) ? null : c.code.toUpperCase();
    if (next && !window.confirm(
      `Show "${c.code}" on the site?\n\n` +
      (autoApply
        ? 'It will be applied automatically on the registration form, and the category cards will show the price with it. '
        : 'It will be shown on the registration form with an Apply button, and the category cards will show the price with it. ') +
      'Anyone can see and use this code.' +
      (featuredCode ? `\n\nThis replaces "${featuredCode}".` : '')
    )) return;

    try {
      await updateEvent(eventId, { featured_coupon_code: next });
      setFeaturedCode(next || '');
      clearQuoteCache();
      setFormError('');
    } catch (err) {
      setFormError(describeSaveError(err, 'site offer settings'));
    }
  };

  /** Apply the site's code automatically, or show it for the runner to apply. */
  const handleModeChange = async (next) => {
    if (next === autoApply || isSavingMode) return;
    // Shown at once, put back if the save fails.
    const previous = autoApply;
    setAutoApply(next);
    setIsSavingMode(true);
    try {
      await updateEvent(eventId, { featured_coupon_auto_apply: next });
      setFormError('');
    } catch (err) {
      setAutoApply(previous);
      setFormError(describeSaveError(err, 'site code settings'));
    } finally {
      setIsSavingMode(false);
    }
  };

  /** The link a club or company is given: it fills the code in for them. */
  const handleCopyLink = async (c) => {
    const link = `${window.location.origin}/register?code=${encodeURIComponent(c.code.toUpperCase())}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(prev => (prev === c.id ? null : prev)), 2000);
    } catch {
      // Clipboard access refused (an insecure origin, or a denied permission).
      window.prompt('Copy this link:', link);
    }
  };

  const handleToggleActive = async (c) => {
    try {
      await updateCoupon(c.id, { is_active: !c.is_active });
      await loadData();
    } catch (err) {
      setFormError(describeSaveError(err, 'coupon'));
    }
  };

  /**
   * Deleting a code that has already given money away removes the only record
   * of why those entries cost less than list price, so a used code is retired
   * rather than removed.
   */
  const handleDelete = async (c) => {
    if (c.redemptions > 0) {
      if (!window.confirm(
        `"${c.code}" has been used ${c.redemptions} time${c.redemptions === 1 ? '' : 's'}. ` +
        'Deleting it would leave those entries with no record of the discount. ' +
        'Deactivate it instead?'
      )) return;
      try {
        await deactivateCoupon(c.id);
        await loadData();
      } catch (err) {
        setFormError(describeSaveError(err, 'coupon'));
      }
      return;
    }

    if (!window.confirm(`Delete the unused code "${c.code}"?`)) return;
    try {
      await deleteCoupon(c.id);
      // Do not leave the site pointing at a code that no longer exists.
      if (isFeatured(c)) await updateEvent(eventId, { featured_coupon_code: null });
      await loadData();
    } catch (err) {
      setFormError(describeSaveError(err, 'coupon'));
    }
  };

  // What the code is worth today: after a scheduled change, the new value.
  const describeValue = (c) => {
    const schedule = scheduleOf(c);
    const value = schedule?.done ? schedule.value : c.discount_value;
    return c.discount_type === 'PERCENT'
      ? `${Number(value)}% off${c.max_discount ? ` (max ${formatPrice(c.max_discount)})` : ''}`
      : `${formatPrice(value)} off`;
  };

  const describeSchedule = (c) => {
    const schedule = scheduleOf(c);
    if (!schedule) return null;
    const from = formatShortDate(schedule.from);
    return schedule.done
      ? `Was ${valueText(c.discount_type, c.discount_value)} until ${formatShortDate(isoDayBefore(schedule.from))}; ${valueText(c.discount_type, schedule.value)} since ${from}`
      : `${valueText(c.discount_type, c.discount_value)} until ${formatShortDate(isoDayBefore(schedule.from))}, then ${valueText(c.discount_type, schedule.value)} from ${from}`;
  };

  const describeRules = (c) => {
    const rules = [];
    if (c.min_participants > 1) rules.push(`${c.min_participants}+ participants`);
    if (c.scope === 'GROUP_ONLY') rules.push('groups only');
    if (c.scope === 'SOLO_ONLY') rules.push('individuals only');
    if (c.applies_to_categories?.length) rules.push(c.applies_to_categories.join(', '));
    if (c.max_uses) rules.push(`${c.uses}/${c.max_uses} uses`);
    const from = formatDate(c.valid_from);
    const until = formatDate(c.valid_until);
    if (from && until) rules.push(`${from} – ${until}`);
    else if (until) rules.push(`until ${until}`);
    else if (from) rules.push(`from ${from}`);
    return rules;
  };

  // India dates, as the database checks them (0026).
  const isExpired = (c) => !!c.valid_until && c.valid_until < indiaToday();
  const isExhausted = (c) => c.max_uses != null && c.uses >= c.max_uses;

  const totalGiven = coupons.reduce((sum, c) => sum + (c.discount_given || 0), 0);

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Discount Codes</h3>
        <button
          className="btn btn-primary admin-action-btn"
          onClick={() => (showForm ? cancelForm() : setShowForm(true))}
          style={{ gap: '6px' }}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
          <span className="admin-action-label">{showForm ? 'Cancel' : 'New Code'}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="admin-media-form glass">
          <h4 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>
            {editingId ? 'Edit Code' : 'New Code'}
          </h4>

          <div className="admin-media-form-grid">
            <div className="admin-media-form-group">
              <label>Code *</label>
              <input
                name="code"
                value={formData.code}
                onChange={(e) => handleInput({
                  target: { name: 'code', value: e.target.value.toUpperCase(), type: 'text' },
                })}
                placeholder="e.g. CLUB20"
                style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
              />
              <span className="admin-field-hint">Runners type this by hand — keep it short.</span>
            </div>

            <div className="admin-media-form-group">
              <label>Discount Type *</label>
              <select name="discount_type" value={formData.discount_type} onChange={handleInput}>
                <option value="PERCENT">Percentage off</option>
                <option value="FLAT">Flat amount off</option>
              </select>
            </div>

            <div className="admin-media-form-group">
              <label>{formData.discount_type === 'PERCENT' ? 'Percentage *' : 'Amount (₹) *'}</label>
              <input
                name="discount_value" type="number" step="1" min="1"
                value={formData.discount_value} onChange={handleInput}
                placeholder={formData.discount_type === 'PERCENT' ? 'e.g. 20' : 'e.g. 200'}
              />
              <span className="admin-field-hint">
                {formData.discount_type === 'FLAT'
                  ? 'Taken off the entry total, not per runner.'
                  : 'Discounts are rounded down to whole rupees.'}
              </span>
            </div>

            {formData.discount_type === 'PERCENT' && (
              <div className="admin-media-form-group">
                <label>Maximum Discount (₹)</label>
                <input
                  name="max_discount" type="number" step="1" min="1"
                  value={formData.max_discount} onChange={handleInput}
                  placeholder="Leave blank for no cap"
                />
                <span className="admin-field-hint">
                  A cap matters on groups: 20% of thirty entries is a large number.
                </span>
              </div>
            )}

            <div className="admin-media-form-group">
              <label>Minimum Participants</label>
              <input
                name="min_participants" type="number" min="1"
                value={formData.min_participants} onChange={handleInput}
              />
              <span className="admin-field-hint">
                The group-discount lever. 1 means no minimum.
              </span>
            </div>

            <div className="admin-media-form-group">
              <label>Where it works</label>
              <select name="scope" value={formData.scope} onChange={handleInput}>
                {SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <span className="admin-field-hint">
                {SCOPES.find(s => s.value === formData.scope)?.hint}
              </span>
            </div>

            <div className="admin-media-form-group">
              <label>Valid From</label>
              <input name="valid_from" type="date" value={formData.valid_from} onChange={handleInput} />
            </div>

            <div className="admin-media-form-group">
              <label>Valid Until</label>
              <input name="valid_until" type="date" value={formData.valid_until} onChange={handleInput} />
            </div>

            <div className="admin-media-form-group">
              <label>Scheduled Change — From</label>
              <input
                name="next_discount_from" type="date"
                value={formData.next_discount_from} onChange={handleInput}
              />
              <span className="admin-field-hint">
                From 00:00 India time on this date, the code is worth the value on the right.
              </span>
            </div>

            <div className="admin-media-form-group">
              <label>{formData.discount_type === 'PERCENT' ? 'Scheduled Change — New %' : 'Scheduled Change — New Amount (₹)'}</label>
              <input
                name="next_discount_value" type="number" step="1" min="1"
                value={formData.next_discount_value} onChange={handleInput}
                placeholder={formData.discount_type === 'PERCENT' ? 'e.g. 10' : 'e.g. 100'}
              />
              <span className="admin-field-hint">
                Same code, so posters stay right. Entries already made keep their discount.
                Leave both blank for no change.
              </span>
              {formData.next_discount_from && formData.next_discount_value !== ''
                && formData.next_discount_from <= indiaToday() && (
                <span className="admin-field-hint admin-field-hint--warn">
                  Already in effect: the code is worth {formData.next_discount_value}
                  {formData.discount_type === 'PERCENT' ? '%' : ' ₹'} now. To schedule another change,
                  put {formData.next_discount_value} in the discount above, then enter the new date and value here.
                </span>
              )}
            </div>

            <div className="admin-media-form-group">
              <label>Maximum Uses</label>
              <input
                name="max_uses" type="number" min="1"
                value={formData.max_uses} onChange={handleInput}
                placeholder="Unlimited"
              />
              <span className="admin-field-hint">
                One group entry counts as one use, however many runners it covers.
              </span>
            </div>
          </div>

          <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="coupon-desc">Description</label>
            <input
              id="coupon-desc" name="description"
              value={formData.description} onChange={handleInput}
              placeholder="e.g. Nashik Runners Club partnership"
            />
            <span className="admin-field-hint">
              Shown to the runner when the code applies. Keep it presentable.
            </span>
          </div>

          <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
            <label>Limit to categories</label>
            <div className="admin-chip-row">
              {categories.length === 0 && (
                <span className="admin-field-hint">No categories configured yet.</span>
              )}
              {categories.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className={`admin-chip ${formData.applies_to_categories.includes(c.name) ? 'is-on' : ''}`}
                  onClick={() => toggleCategory(c.name)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <span className="admin-field-hint">
              None selected = every category. In a mixed group the discount is
              computed only on the runners in the selected categories; the rest
              pay full price.
            </span>
          </div>

          <label className="admin-inline-check" style={{ marginTop: '0.9rem' }}>
            <input
              type="checkbox" name="is_active"
              checked={formData.is_active} onChange={handleInput}
            />
            <span>Active — the code works right now</span>
          </label>

          {formError && (
            <div className="admin-login-error" style={{ marginTop: '0.75rem' }}>
              <span>{formError}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : editingId ? 'Update Code' : 'Create Code'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-outline" onClick={cancelForm}>Cancel Edit</button>
            )}
          </div>
        </form>
      )}

      {!showForm && formError && (
        <div className="admin-login-error" style={{ marginBottom: '1rem' }}>
          <span>{formError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="admin-empty-state">Loading codes…</div>
      ) : coupons.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <Tag size={32} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
          <p>
            No discount codes yet. Create one to offer club, corporate or
            early-bird rates — set a minimum participant count to make it a
            group-only deal.
          </p>
        </div>
      ) : (
        <>
          {totalGiven > 0 && (
            <p className="admin-coupon-summary">
              <TrendingDown size={15} aria-hidden="true" />
              {formatPrice(totalGiven)} discounted across all active entries.
            </p>
          )}

          <div className="admin-offer-mode glass">
            <div className="admin-offer-mode-head">
              <Megaphone size={16} aria-hidden="true" />
              <strong>Site code{featuredCode ? `: ${featuredCode}` : ''}</strong>
              {!featuredCode && (
                <span className="admin-field-hint" style={{ margin: 0 }}>
                  none chosen — use <em>Show on site</em> on a code below
                </span>
              )}
            </div>
            <div className="admin-offer-mode-options" role="radiogroup" aria-label="How the site code is offered">
              <label className="admin-inline-check">
                <input
                  type="radio" name="offer-mode"
                  checked={autoApply} disabled={isSavingMode}
                  onChange={() => handleModeChange(true)}
                />
                <span><strong>Apply automatically</strong> — runners get it without doing anything.</span>
              </label>
              <label className="admin-inline-check">
                <input
                  type="radio" name="offer-mode"
                  checked={!autoApply} disabled={isSavingMode}
                  onChange={() => handleModeChange(false)}
                />
                <span><strong>Show only</strong> — the form shows the code with an Apply button; the runner applies it.</span>
              </label>
            </div>
            <p className="admin-field-hint" style={{ margin: 0 }}>
              <strong>Copy link</strong> on any code gives a link (for a club, company or ambassador)
              that applies that code for whoever opens it — in either mode, and in place of the site code.
              One code per entry: a runner&apos;s own code replaces the site code, never adds to it.
            </p>
          </div>

          <div className="admin-cat-grid">
            {coupons.map(c => {
              const dead = !c.is_active || isExpired(c) || isExhausted(c);
              const status = !c.is_active ? 'Inactive'
                : isExpired(c) ? 'Expired'
                : isExhausted(c) ? 'Used up'
                : 'Active';

              return (
                <div key={c.id} className="admin-cat-card glass">
                  <div className="admin-cat-card-header">
                    <div>
                      <h4 className="admin-cat-name admin-coupon-code">{c.code}</h4>
                      {isFeatured(c) && (
                        <span className="admin-coupon-onsite">
                          <Megaphone size={12} aria-hidden="true" />
                          {dead
                            ? 'Chosen for the site, but not showing'
                            : `Shown on site · ${autoApply ? 'applied automatically' : 'runner taps Apply'}`}
                        </span>
                      )}
                      {c.description && (
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                          {c.description}
                        </span>
                      )}
                    </div>
                    <span className={`admin-badge ${
                      status === 'Active' ? 'admin-badge-paid' : 'admin-badge-cancelled'
                    }`}>
                      {status}
                    </span>
                  </div>

                  <div className="admin-cat-card-body">
                    <div className="admin-cat-price">{describeValue(c)}</div>
                    {describeSchedule(c) && (
                      <span className="admin-coupon-schedule">
                        <CalendarClock size={12} aria-hidden="true" /> {describeSchedule(c)}
                      </span>
                    )}

                    <div className="admin-coupon-rules">
                      {describeRules(c).map(r => (
                        <span key={r} className="admin-coupon-rule">{r}</span>
                      ))}
                      {describeRules(c).length === 0 && (
                        <span className="admin-coupon-rule">No restrictions</span>
                      )}
                    </div>

                    <div className="admin-coupon-stats">
                      <div>
                        <span className="admin-coupon-stat-value">{c.redemptions}</span>
                        <span className="admin-coupon-stat-label">redemption{c.redemptions === 1 ? '' : 's'}</span>
                      </div>
                      <div>
                        <span className="admin-coupon-stat-value">{c.participants_covered}</span>
                        <span className="admin-coupon-stat-label">runners</span>
                      </div>
                      <div>
                        <span className="admin-coupon-stat-value">{formatPrice(c.discount_given)}</span>
                        <span className="admin-coupon-stat-label">given</span>
                      </div>
                    </div>
                  </div>

                  <div className="admin-cat-card-actions admin-coupon-actions">
                    <button className="admin-cat-action-btn" onClick={() => startEdit(c)}>
                      <Edit3 size={14} /> Edit
                    </button>
                    <button className="admin-cat-action-btn" onClick={() => handleToggleActive(c)}>
                      <Power size={14} /> {dead && !c.is_active ? 'Reactivate' : 'Deactivate'}
                    </button>
                    <button
                      className="admin-cat-action-btn"
                      onClick={() => handleToggleFeatured(c)}
                      disabled={dead && !isFeatured(c)}
                      title={dead && !isFeatured(c) ? 'Only a working code can be shown on the site.' : undefined}
                    >
                      <Megaphone size={14} /> {isFeatured(c) ? 'Remove from site' : 'Show on site'}
                    </button>
                    <button className="admin-cat-action-btn" onClick={() => handleCopyLink(c)}>
                      {copiedId === c.id ? <Check size={14} /> : <Link2 size={14} />}
                      {copiedId === c.id ? 'Copied' : 'Copy link'}
                    </button>
                    <button
                      className="admin-cat-action-btn admin-cat-delete-btn"
                      onClick={() => handleDelete(c)}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
