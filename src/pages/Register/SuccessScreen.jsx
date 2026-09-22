import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { CheckCircle, Clock } from 'lucide-react';

/**
 * Shown after the entry is saved.
 *
 * `registration` is the row Supabase returned, so the bib and category are the
 * real stored values. The previous version invented a reference with
 * Math.random() — a number support could never look up — and told the runner a
 * confirmation email had been sent when nothing sends one.
 */
export default function SuccessScreen({ registration, eventName, contactEmail, contactPhone }) {
  const bib = registration?.bib;
  const isPending = (registration?.payment_status || 'PENDING') === 'PENDING';

  return (
    <div className="reg-success">
      <CheckCircle size={72} className="reg-success-icon" aria-hidden="true" />
      <h2 className="reg-success-title">Registration received</h2>
      <p className="reg-success-subtitle">
        Your entry for {eventName} is saved. Keep your bib number for reference.
      </p>

      <div className="reg-success-card">
        <div className="reg-success-bib">
          <span className="reg-success-bib-label">Bib Number</span>
          <span className="reg-success-bib-value">{bib || '—'}</span>
        </div>

        <dl className="reg-summary-list">
          <div>
            <dt>Runner</dt>
            <dd>{registration?.first_name} {registration?.last_name}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{registration?.category}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {isPending ? (
                <span className="reg-status-pending">
                  <Clock size={14} aria-hidden="true" /> Payment pending
                </span>
              ) : (
                <span className="reg-status-paid">Confirmed</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="reg-success-next">
        <h3>What happens next</h3>
        <ol>
          <li>
            The organisers will contact you at <strong>{registration?.email}</strong> with
            payment instructions.
          </li>
          <li>Your place is confirmed once payment is received.</li>
          <li>Bib collection details are shared closer to race day. Carry a government photo ID.</li>
        </ol>

        {(contactEmail || contactPhone) && (
          <p className="reg-success-contact">
            Questions? Reach us at{' '}
            {contactEmail && <a href={`mailto:${contactEmail}`}>{contactEmail}</a>}
            {contactEmail && contactPhone && ' or '}
            {contactPhone && <a href={`tel:${contactPhone.replace(/\s+/g, '')}`}>{contactPhone}</a>}.
          </p>
        )}
      </div>

      <div className="reg-actions reg-actions--center">
        <Link to="/"><Button variant="outline">Back to home</Button></Link>
        <Link to="/event"><Button variant="primary">Event details</Button></Link>
      </div>
    </div>
  );
}
