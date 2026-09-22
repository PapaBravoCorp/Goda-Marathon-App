import React from 'react';
import { Button } from '../../components/Button';
import { AlertCircle, Info } from 'lucide-react';

const DECLARATIONS = [
  {
    name: 'isMedicallyFit',
    text: 'I declare that I am physically fit and have trained sufficiently to take part in this event.',
  },
  {
    name: 'acceptsRisk',
    text: 'I understand that trail running carries risk, and I accept responsibility for my own injury or health issues arising from taking part.',
  },
  {
    name: 'acceptsRefundPolicy',
    text: 'I accept the cancellation and refund policy: entries are non-refundable and non-transferable.',
  },
  {
    name: 'consentsToMedia',
    text: 'I permit the organisers to use photographs and video of my participation for promotional purposes.',
  },
];

/**
 * Step 3 — declarations, then submit.
 *
 * There is no payment integration behind this. The button therefore does not
 * pretend to take money: it records the entry with payment_status PENDING and
 * says so plainly, rather than the previous flow's two-second fake delay
 * followed by a "Registration Confirmed!" screen.
 */
export default function StepConfirm({
  formData, waivers, errors, category,
  onWaiverChange, onBack, onSubmit, isSubmitting, formatCurrency, submitError,
}) {
  const price = category?.price ?? 0;

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <div>
        <h2 className="reg-step-title">Confirm your entry</h2>
        <p className="reg-step-subtitle">Check the summary, then accept the declarations.</p>
      </div>

      <section className="reg-summary">
        <h3 className="reg-section-title">Summary</h3>
        <dl className="reg-summary-list">
          <div><dt>Runner</dt><dd>{formData.firstName} {formData.lastName}</dd></div>
          <div><dt>Email</dt><dd>{formData.email}</dd></div>
          <div><dt>Category</dt><dd>{formData.category || '—'}</dd></div>
          <div><dt>T-shirt</dt><dd>{formData.tshirtSize || '—'}</dd></div>
          {formData.couponCode && (
            <div><dt>Coupon</dt><dd>{formData.couponCode} <span className="reg-summary-note">(checked by organisers)</span></dd></div>
          )}
          <div className="reg-summary-total">
            <dt>Entry fee</dt>
            <dd>{formatCurrency(price)}</dd>
          </div>
        </dl>
      </section>

      <fieldset className="reg-fieldset">
        <legend className="reg-legend">
          Declarations <span className="reg-required" aria-hidden="true">*</span>
        </legend>

        {errors.waivers && (
          <p className="reg-error reg-error--block" role="alert">{errors.waivers}</p>
        )}

        <div className="reg-declarations">
          {DECLARATIONS.map(d => (
            <label
              key={d.name}
              htmlFor={d.name}
              className={`reg-checkbox reg-checkbox--block ${errors.waivers && !waivers[d.name] ? 'has-error' : ''}`}
            >
              <input
                type="checkbox"
                id={d.name}
                name={d.name}
                checked={waivers[d.name]}
                onChange={onWaiverChange}
              />
              <span>{d.text}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="reg-payment-note">
        <Info size={18} aria-hidden="true" />
        <div>
          <strong>Payment is collected separately.</strong>
          <p>
            Submitting this form reserves your entry and records it as <em>payment pending</em>.
            The organisers will contact you at <strong>{formData.email || 'your email'}</strong> with
            payment instructions. Your place is confirmed once payment is received.
          </p>
        </div>
      </div>

      {submitError && (
        <div className="reg-submit-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="reg-actions">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>Back</Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Submit registration'}
        </Button>
      </div>
    </form>
  );
}
