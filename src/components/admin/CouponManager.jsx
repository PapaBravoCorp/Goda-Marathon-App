import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Trash2, Edit3, Tag, Power, TrendingDown } from 'lucide-react';

import { getCoupons, addCoupon, updateCoupon, deactivateCoupon, deleteCoupon } from '../../utils/services/coupons';
import { getEventCategories } from '../../utils/services/categories';
import { describeSaveError } from '../../utils/services/errors';

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

  const emptyForm = {
    code: '', description: '',
    discount_type: 'PERCENT', discount_value: '', max_discount: '',
    min_participants: 1, scope: 'ANY',
    applies_to_categories: [],
    valid_from: '', valid_until: '',
    max_uses: '', is_active: true,
  };
  const [formData, setFormData] = useState(emptyForm);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [list, cats] = await Promise.all([
        getCoupons(eventId),
        getEventCategories(eventId, eventId),
      ]);
      setCoupons(list);
      setCategories(cats);
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

      if (editingId) {
        await updateCoupon(editingId, payload);
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
      await loadData();
    } catch (err) {
      setFormError(describeSaveError(err, 'coupon'));
    }
  };

  const describeValue = (c) =>
    c.discount_type === 'PERCENT'
      ? `${Number(c.discount_value)}% off${c.max_discount ? ` (max ${formatPrice(c.max_discount)})` : ''}`
      : `${formatPrice(c.discount_value)} off`;

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

  const isExpired = (c) => c.valid_until && new Date(c.valid_until) < new Date(new Date().toDateString());
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

                  <div className="admin-cat-card-actions">
                    <button className="admin-cat-action-btn" onClick={() => startEdit(c)}>
                      <Edit3 size={14} /> Edit
                    </button>
                    <button className="admin-cat-action-btn" onClick={() => handleToggleActive(c)}>
                      <Power size={14} /> {dead && !c.is_active ? 'Reactivate' : 'Deactivate'}
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
