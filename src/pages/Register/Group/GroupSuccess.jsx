import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Clock, Download, Tag } from 'lucide-react';

import { Button } from '../../../components/Button';
import { describeCouponReason } from '../../../utils/services/coupons';

/**
 * Shown after the group is saved.
 *
 * Everything here is the row the database returned — real bib numbers, the
 * real group code, the price actually stored against each runner. The solo
 * flow learned this the hard way: its predecessor invented a reference with
 * Math.random() that support could never look up.
 */
export default function GroupSuccess({
  result, eventName, contactEmail, contactPhone, formatCurrency,
}) {
  const participants = result?.participants || [];

  /**
   * The roster as a CSV, built from the response rather than from form state.
   *
   * A coordinator who has just entered twenty people needs the bib numbers to
   * circulate, and asking them to transcribe twenty rows off a web page is how
   * bib numbers get mistyped.
   */
  const downloadRoster = () => {
    const cell = (value) => {
      if (value === null || value === undefined) return '""';
      let s = String(value);
      // A leading =, +, - or @ makes Excel treat the cell as a formula.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };

    const headers = ['Bib', 'Name', 'Email', 'Category', 'Entry Fee', 'Discount', 'Payable'];
    const rows = participants.map(p => [
      cell(p.bib),
      cell(`${p.first_name || ''} ${p.last_name || ''}`.trim()),
      cell(p.email),
      cell(p.category),
      cell(p.list_price),
      cell(p.discount),
      cell(p.price),
    ].join(','));

    const csv = [headers.map(cell).join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${result?.group_code || 'group'}_roster.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="reg-success">
      <CheckCircle size={72} className="reg-success-icon" aria-hidden="true" />
      <h2 className="reg-success-title">Group registration received</h2>
      <p className="reg-success-subtitle">
        {result?.participant_count} entries for {eventName} are saved. Quote your
        group reference in any correspondence.
      </p>

      <div className="reg-success-card">
        <div className="reg-success-bib">
          <span className="reg-success-bib-label">Group Reference</span>
          <span className="reg-success-bib-value">{result?.group_code || '—'}</span>
        </div>

        <dl className="reg-summary-list">
          <div>
            <dt>Participants</dt>
            <dd>{result?.participant_count}</dd>
          </div>
          <div>
            <dt>Entry fees</dt>
            <dd>{formatCurrency(result?.subtotal)}</dd>
          </div>
          {Number(result?.discount) > 0 && (
            <div className="grp-summary-discount">
              <dt>
                Discount {result?.coupon_code ? `(${result.coupon_code})` : ''}
              </dt>
              <dd>− {formatCurrency(result.discount)}</dd>
            </div>
          )}
          <div className="reg-summary-total">
            <dt>Amount payable</dt>
            <dd>{formatCurrency(result?.total)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className="reg-status-pending">
                <Clock size={14} aria-hidden="true" /> Payment pending
              </span>
            </dd>
          </div>
        </dl>

        {/* A code that was typed but did not apply is said so plainly, with the
            database's own reason. `coupon_reason` is set only when a code was
            actually attempted, so this stays silent for the common case of no
            code at all. Leaving it unmentioned means the coordinator meets the
            higher figure at payment time and assumes a mistake was made. */}
        {result?.coupon_applied === false && result?.coupon_reason && (
          <p className="grp-coupon-notapplied">
            <Tag size={14} aria-hidden="true" />
            <span>
              {describeCouponReason({ valid: false, reason: result.coupon_reason })}{' '}
              The total above is at standard rates — contact us if you believe
              this is wrong.
            </span>
          </p>
        )}
      </div>

      <div className="grp-roster-result">
        <div className="grp-roster-result-head">
          <h3>Bib numbers</h3>
          <button type="button" className="grp-csv-btn" onClick={downloadRoster}>
            <Download size={15} aria-hidden="true" /> Download roster (CSV)
          </button>
        </div>

        <div className="grp-review-table-wrap">
          <table className="grp-review-table">
            <thead>
              <tr>
                <th scope="col">Bib</th>
                <th scope="col">Runner</th>
                <th scope="col">Category</th>
                <th scope="col" className="grp-num">Payable</th>
              </tr>
            </thead>
            <tbody>
              {participants.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.bib}</strong></td>
                  <td>
                    <span className="grp-review-name">{p.first_name} {p.last_name}</span>
                    <span className="grp-review-email">{p.email}</span>
                  </td>
                  <td>{p.category}</td>
                  <td className="grp-num">{formatCurrency(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="reg-success-next">
        <h3>What happens next</h3>
        <ol>
          <li>
            The organisers will contact you at <strong>{result?.captain_email}</strong> with
            payment instructions for {formatCurrency(result?.total)}.
          </li>
          <li>Every place in the group is confirmed once payment is received.</li>
          <li>
            Bib collection details are shared closer to race day. Each runner
            carries their own government photo ID.
          </li>
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
