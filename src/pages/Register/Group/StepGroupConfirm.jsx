import React from 'react';
import { AlertCircle, Info, Tag, Check, Loader } from 'lucide-react';

import { Button } from '../../../components/Button';
import { describeCouponReason } from '../../../utils/services/coupons';

const DECLARATIONS = [
  {
    name: 'waivers',
    text: 'On behalf of every participant listed, I confirm they are physically fit, that they accept the risks of trail running, that entries are non-refundable and non-transferable, and that the organisers may use photographs and video of their participation for promotional purposes.',
  },
  {
    name: 'authority',
    text: 'I confirm I am authorised to enter these participants and that the details I have given for each of them are accurate. Where a participant is under 18, I confirm their parent or guardian has consented.',
  },
];

/**
 * Step 3 — discount, summary, declarations.
 *
 * The coupon box quotes from the database rather than computing anything here.
 * A discount worked out in the browser is a discount the browser can edit, and
 * it would also have to re-implement every rule -- minimum group size, category
 * eligibility, percentage caps, expiry -- with the certainty of eventually
 * disagreeing with what is charged.
 */
export default function StepGroupConfirm({
  captain, participants, categoryByName,
  couponCode, onCouponChange, quote, isQuoting,
  subtotal, discount, total,
  waiversAccepted, authorityConfirmed, onWaiversChange, onAuthorityChange,
  errors, onBack, onSubmit, isSubmitting, submitError, formatCurrency,
}) {
  const applied = !!quote?.valid;
  const refusal = couponCode.trim() && quote && !quote.valid && quote.reason !== 'PREVIEW_FAILED'
    ? describeCouponReason(quote)
    : '';

  const perPerson = participants.length > 0 ? total / participants.length : 0;

  return (
    <form onSubmit={onSubmit} className="space-y-8" noValidate>
      <div>
        <h2 className="reg-step-title">Confirm your group</h2>
        <p className="reg-step-subtitle">
          Check the roster and totals, apply any discount code, then accept the
          declarations.
        </p>
      </div>

      <section>
        <h3 className="reg-section-title">Coordinator</h3>
        <dl className="reg-summary-list">
          <div><dt>Name</dt><dd>{captain.firstName} {captain.lastName}</dd></div>
          <div><dt>Group</dt><dd>{captain.organisationName}</dd></div>
          <div><dt>Email</dt><dd>{captain.email}</dd></div>
          <div><dt>Phone</dt><dd>{captain.phone}</dd></div>
        </dl>
      </section>

      <section>
        <h3 className="reg-section-title">
          Participants <span className="grp-count-chip">{participants.length}</span>
        </h3>

        <div className="grp-review-table-wrap">
          <table className="grp-review-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Runner</th>
                <th scope="col">Category</th>
                <th scope="col">T-Shirt</th>
                <th scope="col" className="grp-num">Fee</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p, i) => (
                <tr key={p._key}>
                  <td className="grp-review-num">{i + 1}</td>
                  <td>
                    <span className="grp-review-name">{p.firstName} {p.lastName}</span>
                    <span className="grp-review-email">{p.email}</span>
                  </td>
                  <td>{p.category}</td>
                  <td>{p.tshirtSize}</td>
                  <td className="grp-num">{formatCurrency(categoryByName.get(p.category)?.price || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="reg-section-title">Discount code</h3>

        <div className={`grp-coupon ${applied ? 'is-applied' : ''} ${refusal ? 'is-rejected' : ''}`}>
          <Tag size={18} aria-hidden="true" className="grp-coupon-icon" />

          <div className="grp-coupon-input">
            <label htmlFor="groupCoupon" className="sr-only">Discount code</label>
            <input
              id="groupCoupon"
              type="text"
              value={couponCode}
              // Uppercased as it is typed: codes are matched case-insensitively
              // by the database, and showing them one way avoids a coordinator
              // wondering whether "club20" was the wrong thing to type.
              onChange={(e) => onCouponChange(e.target.value.toUpperCase())}
              placeholder="Enter code"
              autoComplete="off"
              spellCheck="false"
              className="reg-control"
              aria-describedby="coupon-status"
            />
          </div>

          <div className="grp-coupon-status" id="coupon-status" role="status">
            {isQuoting && <span className="grp-coupon-busy"><Loader size={14} className="spin" aria-hidden="true" /> Checking…</span>}
            {!isQuoting && applied && (
              <span className="grp-coupon-ok">
                <Check size={15} aria-hidden="true" />
                {quote.description || `${quote.code} applied`} — {formatCurrency(discount)} off
              </span>
            )}
            {!isQuoting && refusal && (
              <span className="grp-coupon-bad">
                <AlertCircle size={15} aria-hidden="true" /> {refusal}
              </span>
            )}
          </div>
        </div>

        <p className="reg-hint grp-coupon-hint">
          Optional. Group discounts often need a minimum number of participants —
          the amount above updates as your roster changes.
        </p>
      </section>

      <section className="reg-summary">
        <h3 className="reg-section-title">Total</h3>
        <dl className="reg-summary-list">
          <div>
            <dt>Entry fees ({participants.length} participant{participants.length === 1 ? '' : 's'})</dt>
            <dd>{formatCurrency(subtotal)}</dd>
          </div>
          {discount > 0 && (
            <div className="grp-summary-discount">
              <dt>Discount {quote?.code ? `(${quote.code})` : ''}</dt>
              <dd>− {formatCurrency(discount)}</dd>
            </div>
          )}
          <div className="reg-summary-total">
            <dt>Amount payable</dt>
            <dd>{formatCurrency(total)}</dd>
          </div>
        </dl>
        {participants.length > 1 && (
          <p className="grp-per-person">
            Works out at {formatCurrency(perPerson)} per runner.
          </p>
        )}
      </section>

      <fieldset className="reg-fieldset">
        <legend className="reg-legend">
          Declarations <span className="reg-required" aria-hidden="true">*</span>
        </legend>

        {errors.waivers && (
          <p className="reg-error reg-error--block" role="alert">{errors.waivers}</p>
        )}

        <div className="reg-declarations">
          <label
            htmlFor="grp-waivers"
            className={`reg-checkbox reg-checkbox--block ${errors.waivers && !waiversAccepted ? 'has-error' : ''}`}
          >
            <input
              type="checkbox" id="grp-waivers" checked={waiversAccepted}
              onChange={(e) => onWaiversChange(e.target.checked)}
            />
            <span>{DECLARATIONS[0].text}</span>
          </label>

          <label
            htmlFor="grp-authority"
            className={`reg-checkbox reg-checkbox--block ${errors.waivers && !authorityConfirmed ? 'has-error' : ''}`}
          >
            <input
              type="checkbox" id="grp-authority" checked={authorityConfirmed}
              onChange={(e) => onAuthorityChange(e.target.checked)}
            />
            <span>{DECLARATIONS[1].text}</span>
          </label>
        </div>
      </fieldset>

      <div className="reg-payment-note">
        <Info size={18} aria-hidden="true" />
        <div>
          <strong>Payment is collected separately.</strong>
          <p>
            Submitting reserves every place in this group and records them as
            <em> payment pending</em>. The organisers will contact you at{' '}
            <strong>{captain.email || 'your email'}</strong> with instructions for
            the full amount. The group&apos;s places are confirmed once payment is
            received.
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
          {isSubmitting
            ? `Submitting ${participants.length} entries…`
            : `Submit group — ${formatCurrency(total)}`}
        </Button>
      </div>
    </form>
  );
}
