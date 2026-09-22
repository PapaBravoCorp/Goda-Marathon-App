import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage from './LegalPage';
import { ORGANISATION } from '../../utils/constants';

/**
 * Cancellation and refund policy.
 *
 * Deliberately matches the declaration a runner actually ticks on the confirm
 * step: "entries are non-refundable and non-transferable".
 *
 * Note for the organisers: the seeded FAQ says the opposite -- "you can
 * transfer your bib to another runner up to 14 days before the event". One of
 * the two is wrong, and a runner who relied on the FAQ has a fair complaint.
 * Decide which position you want and make the FAQ, this page and the
 * declaration text in src/pages/Register/StepConfirm.jsx agree.
 */
export default function RefundPolicy() {
  return (
    <LegalPage
      title="Cancellation and Refund Policy"
      description={`What happens to your entry fee if you withdraw from the GODA Epic Trail Run, or if the event is cancelled or postponed.`}
      lastUpdated="2026-09-21"
    >
      <p>
        This policy explains what happens to your entry fee if you cannot take
        part, and what happens if the event itself changes. It forms part of the{' '}
        <Link to="/terms">Terms and Conditions</Link> you accept when registering.
      </p>

      <h2>1. If you withdraw</h2>
      <div className="legal-callout">
        <p>
          <strong>Entry fees are non-refundable and entries are non-transferable.</strong>{' '}
          This is the declaration you accept at registration.
        </p>
      </div>
      <p>
        Costs are committed long before race day: permissions, medical and rescue
        cover, timing, hydration, medals and T-shirts are ordered against the number
        of entries received. A withdrawal close to the event does not release those
        costs.
      </p>
      <p>
        This applies however the withdrawal comes about, including injury, illness,
        travel difficulty or a clash of dates. If you have personal insurance that
        covers event entry fees, we will supply a letter confirming your entry for
        your claim.
      </p>

      <h2>2. If you have not yet paid</h2>
      <p>
        An entry marked <strong>payment pending</strong> has not been confirmed. If
        you decide not to go ahead, tell us and we will cancel it. Nothing is owed.
      </p>

      <h2>3. If we cancel the event</h2>
      <p>
        If the event is cancelled outright and not rescheduled, registered
        participants who have paid will be offered <strong>either</strong> a refund
        of the entry fee less any payment-processing charges that cannot be
        recovered, <strong>or</strong> a transfer of the entry to the next edition.
        You choose.
      </p>

      <h2>4. If we postpone the event</h2>
      <p>
        If the event is moved to a new date, your entry moves with it automatically.
        If you cannot make the new date, tell us within 14 days of the announcement
        and your entry will be carried over to the following edition instead.
      </p>

      <h2>5. If we shorten or alter the course</h2>
      <p>
        Weather, ground conditions or an instruction from an authority may force us
        to shorten a route, change a start time or adjust the format. The event has
        still taken place, and no refund is due in these circumstances.
      </p>

      <h2>6. Changing your category</h2>
      <p>
        You may ask to move to a different category up to the date announced for
        the edition, subject to places being available and to meeting the minimum
        age for it. Moving to a more expensive category requires the difference to
        be paid. Moving to a cheaper one does not produce a refund of the
        difference.
      </p>

      <h2>7. Duplicate or incorrect payments</h2>
      <p>
        If you are charged twice, or charged an amount that does not match your
        category, write to us with the payment reference. Confirmed duplicates are
        refunded in full to the original payment method.
      </p>

      <h2>8. How to reach us</h2>
      <p>
        Email <a href={`mailto:${ORGANISATION.email}`}>{ORGANISATION.email}</a> from the
        address you registered with, or call{' '}
        <a href={`tel:${ORGANISATION.phone.replace(/\s+/g, '')}`}>{ORGANISATION.phone}</a>.
        Include your bib number if you have one. We aim to respond within five
        working days.
      </p>
      <p>
        Where a refund is approved, it is returned to the original payment method.
        Allow up to 7 to 10 working days for it to appear, depending on your bank.
      </p>
    </LegalPage>
  );
}
