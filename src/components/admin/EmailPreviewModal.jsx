import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import ModalLayer from './ModalLayer';
import { ORGANISATION } from '../../utils/constants';
// The same file the send-emails edge function renders with, so what is shown
// here is what runners receive -- not a lookalike that drifts.
import { renderEmail } from '../../../supabase/functions/_shared/emailTemplates.ts';

const SAMPLE_RUNNER = {
  first_name: 'Asha',
  last_name: 'Patil',
  email: 'asha.patil@example.com',
  bib: '10042',
  category: '10K Run',
  tshirt_size: 'M',
  price: 1299,
  list_price: 1299,
  discount_amount: 0,
  payment_ref: 'pay_SAMPLE12345',
  emergency_contact_name: 'Ravi Patil',
  emergency_contact_number: '+91 98765 43210',
};

const SAMPLE_GROUP = {
  group_code: 'G-1001',
  captain_first_name: 'Ravi',
  captain_last_name: 'Kale',
  participant_count: 3,
  subtotal: 2897,
  discount: 0,
  total: 2897,
  payment_ref: 'pay_SAMPLE67890',
};

const SAMPLE_MEMBERS = [
  { first_name: 'Ravi', last_name: 'Kale', email: 'ravi@example.com', bib: '10101', category: '10K Run' },
  { first_name: 'Meera', last_name: 'Kale', email: 'meera@example.com', bib: '5102', category: '5K Run' },
  { first_name: 'Arjun', last_name: 'Kale', email: 'arjun@example.com', bib: '5103', category: '5K Run' },
];

const VARIANTS = [
  { id: 'REGISTRATION_CONFIRMED', label: 'Runner: confirmed' },
  { id: 'GROUP_CONFIRMED', label: 'Group coordinator: confirmed' },
  { id: 'REGISTRATION_RECEIVED', label: 'Runner: received, payment pending' },
];

/** Preview of the automatic registration emails with sample runner data and the event as currently edited. */
export default function EmailPreviewModal({ event, onClose }) {
  const [kind, setKind] = useState('REGISTRATION_CONFIRMED');

  const email = useMemo(() => renderEmail({
    kind,
    event: {
      name: event?.name || 'Your event',
      date: event?.date,
      flag_off_time: event?.flag_off_time,
      venue: event?.venue,
      location: event?.location,
      contact_email: event?.contact_email,
      contact_phone: event?.contact_phone,
      confirmation_email_note: event?.confirmation_email_note,
    },
    runner: kind === 'REGISTRATION_RECEIVED' ? { ...SAMPLE_RUNNER, payment_ref: null } : SAMPLE_RUNNER,
    group: kind === 'GROUP_CONFIRMED' ? SAMPLE_GROUP : null,
    members: SAMPLE_MEMBERS,
    siteUrl: window.location.origin,
    organiser: { name: ORGANISATION.name, email: ORGANISATION.email, phone: ORGANISATION.phone },
  }), [kind, event]);

  return (
    <ModalLayer onClose={onClose}>
      <div className="admin-modal glass admin-email-preview-modal" role="dialog" aria-modal="true" aria-labelledby="email-preview-title">
        <div className="admin-modal-header">
          <h3 id="email-preview-title">Email preview</h3>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close preview"><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="admin-modal-body">
          <div className="admin-chip-row" role="tablist" aria-label="Which email">
            {VARIANTS.map(v => (
              <button key={v.id} role="tab" aria-selected={kind === v.id}
                className={`admin-chip ${kind === v.id ? 'is-on' : ''}`} onClick={() => setKind(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
          <p className="admin-email-preview-subject">
            <span>Subject</span> {email.subject}
          </p>
          <iframe
            title="Email preview"
            className="admin-email-preview-frame"
            sandbox=""
            srcDoc={email.html}
          />
          <p className="admin-field-hint" style={{ marginTop: '0.75rem' }}>
            Sample runner details; event details and race-day information as currently entered, including
            unsaved changes. Save the settings before new emails use them.
          </p>
        </div>
      </div>
    </ModalLayer>
  );
}
