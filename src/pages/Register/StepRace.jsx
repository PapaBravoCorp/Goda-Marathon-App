import React from 'react';
import { Button } from '../../components/Button';
import { Field } from './Field';
import { controlClass } from './controls';
import { Check, Lock, AlertCircle } from 'lucide-react';
import { levelLabel } from '../../utils/categoryLevels';
import { dealFor } from '../../utils/offer';

/**
 * Step 1 — the race itself.
 *
 * Deliberately first: the old flow asked for twelve required personal details,
 * including blood group and emergency contacts, before a runner could see what
 * anything cost or whether they were even eligible.
 *
 * Date of birth lives here rather than with the personal details because
 * category eligibility depends on it, and it has to be known before the
 * categories can be filtered.
 *
 * `quotes` is the database's price for the code in the coupon field, one per
 * category. A card with a discount shows the list price struck through beside
 * what the runner will pay, so the price they choose on is the price charged.
 */
export default function StepRace({
  formData, errors, age, categories,
  onChange, onSelectCategory, onNext, formatCurrency,
  quotes = {}, couponStatus = null,
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={onNext} className="space-y-8" noValidate>
      <div>
        <h2 className="reg-step-title">Choose your race</h2>
        <p className="reg-step-subtitle">
          Pick a distance and we&apos;ll take your details next.
        </p>
      </div>

      <Field
        id="dob"
        label="Date of Birth"
        required
        error={errors.dob}
        hint="Used to check which categories you are eligible for."
        className="reg-field--narrow"
      >
        {(a11y) => (
          <input
            {...a11y}
            type="date"
            name="dob"
            max={today}
            value={formData.dob}
            onChange={onChange}
            className={controlClass(errors.dob)}
          />
        )}
      </Field>

      {age !== null && (
        <p className="reg-age-note">
          You are <strong>{age}</strong> years old on today&apos;s date.
        </p>
      )}

      <fieldset className="reg-fieldset">
        <legend className="reg-legend">
          Race Category <span className="reg-required" aria-hidden="true">*</span>
        </legend>

        {errors.category && (
          <p className="reg-error reg-error--block" role="alert">{errors.category}</p>
        )}

        {categories.length === 0 ? (
          <p className="text-muted">Categories will be announced soon.</p>
        ) : (
          <div className="reg-category-list">
            {categories.map((cat) => {
              const eligible = age === null || age >= cat.minAge;
              const available = cat.status === 'Open';
              const disabled = !eligible || !available;
              const selected = formData.category === cat.name;
              const deal = dealFor(quotes, cat.name, cat.price);

              return (
                <label
                  key={cat.id ?? cat.name}
                  className={`reg-category ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={cat.name}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => onSelectCategory(cat.name)}
                    className="sr-only"
                  />

                  <span className="reg-category-check" aria-hidden="true">
                    {selected ? <Check size={16} /> : disabled ? <Lock size={13} /> : null}
                  </span>

                  <span className="reg-category-main">
                    <span className="reg-category-name">{cat.name}</span>
                    <span className="reg-category-meta">
                      {[
                        cat.distance,
                        levelLabel(cat.level),
                        cat.elevation && cat.elevation !== '0m' ? `${cat.elevation} elevation` : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </span>

                  <span className="reg-category-side">
                    {deal ? (
                      <>
                        <span className="reg-category-price">
                          <s className="reg-category-mrp">
                            <span className="sr-only">Was </span>{formatCurrency(deal.list)}
                          </s>{' '}
                          <span className="sr-only">now </span>{formatCurrency(deal.price)}
                        </span>
                        <span className="reg-category-flag is-offer">with code {deal.code}</span>
                      </>
                    ) : (
                      <span className="reg-category-price">{formatCurrency(cat.price)}</span>
                    )}
                    {!eligible && <span className="reg-category-flag is-blocked">Minimum age {cat.minAge}</span>}
                    {eligible && !available && <span className="reg-category-flag is-blocked">{cat.status}</span>}
                    {eligible && available && cat.slotsLeft !== null && cat.slotsLeft <= 10 && (
                      <span className="reg-category-flag is-scarce">
                        {cat.slotsLeft} slot{cat.slotsLeft === 1 ? '' : 's'} left
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="reg-grid">
        <Field id="tshirtSize" label="T-Shirt Size" required error={errors.tshirtSize}>
          {(a11y) => (
            <select
              {...a11y}
              name="tshirtSize"
              value={formData.tshirtSize}
              onChange={onChange}
              className={controlClass(errors.tshirtSize)}
            >
              <option value="">Select size…</option>
              <option value="XS">XS</option>
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
              <option value="XL">XL</option>
              <option value="XXL">XXL</option>
            </select>
          )}
        </Field>

        <Field
          id="estimatedTime"
          label="Estimated Finish Time"
          error={errors.estimatedTime}
          hint="Optional — helps us group the start waves."
        >
          {(a11y) => (
            <input
              {...a11y}
              type="text"
              name="estimatedTime"
              value={formData.estimatedTime}
              onChange={onChange}
              placeholder="HH:MM:SS"
              className={controlClass(errors.estimatedTime)}
            />
          )}
        </Field>
      </div>

      <Field
        id="couponCode"
        label="Coupon / Referral Code"
        error={errors.couponCode}
        hint={couponStatus ? undefined : 'Optional. The prices above change as soon as a code applies.'}
      >
        {(a11y) => (
          <>
            <input
              {...a11y}
              type="text"
              name="couponCode"
              value={formData.couponCode}
              onChange={onChange}
              placeholder="Enter code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
              className={`${controlClass(errors.couponCode)} reg-coupon-input`}
              aria-describedby={couponStatus ? 'couponCode-status' : a11y['aria-describedby']}
            />
            {couponStatus && (
              <span
                id="couponCode-status"
                role="status"
                className={`reg-coupon-status ${couponStatus.ok ? 'is-ok' : 'is-bad'}`}
              >
                {couponStatus.ok
                  ? <Check size={14} aria-hidden="true" />
                  : <AlertCircle size={14} aria-hidden="true" />}
                {couponStatus.text}
              </span>
            )}
          </>
        )}
      </Field>

      <div className="reg-actions reg-actions--end">
        <Button type="submit" variant="primary">Continue to your details</Button>
      </div>
    </form>
  );
}
