import React, { useState } from 'react';
import { Copy, Trash2, ChevronDown, AlertCircle, User } from 'lucide-react';

import { Field } from '../Field';
import { controlClass } from '../controls';
import { calculateAge } from '../../../utils/validation';
import { TSHIRT_SIZES, BLOOD_GROUPS, GENDERS } from './groupHelpers';

/**
 * One runner in the roster.
 *
 * Required fields are always visible; everything optional sits behind a
 * disclosure. Twenty rows each showing thirteen controls is a wall that makes
 * the form look longer than it is, and the optional fields are the ones a
 * coordinator entering a corporate team will never fill in.
 *
 * The disclosure opens by itself when one of the fields inside it has an
 * error, so a problem can never be hidden behind a collapsed section.
 */
export default function ParticipantRow({
  index, participant, errors, categories, captain,
  onChange, onDuplicate, onRemove, canRemove, formatCurrency,
}) {
  const [showExtras, setShowExtras] = useState(false);

  const err = (field) => errors[`p${index}.${field}`];
  const key = (field) => `p${index}.${field}`;

  const extrasFields = ['emergencyContactName', 'emergencyContactNumber', 'allergies', 'estimatedTime'];
  const extrasHaveError = extrasFields.some(f => err(f));
  const isOpen = showExtras || extrasHaveError;

  const age = calculateAge(participant.dob);
  const today = new Date().toISOString().slice(0, 10);

  const selected = categories.find(c => c.name === participant.category);
  const name = [participant.firstName, participant.lastName].filter(Boolean).join(' ');

  const set = (field) => (e) => onChange(index, field, e.target.value);

  return (
    <li className={`grp-row ${Object.keys(errors).some(k => k.startsWith(`p${index}.`)) ? 'has-error' : ''}`}>
      <div className="grp-row-head">
        <span className="grp-row-num" aria-hidden="true">{index + 1}</span>
        <span className="grp-row-title">
          {name || <span className="grp-row-untitled"><User size={14} aria-hidden="true" /> New participant</span>}
        </span>

        <span className="grp-row-head-side">
          {selected && (
            <span className="grp-row-price">{formatCurrency(selected.price)}</span>
          )}
          <button
            type="button"
            className="grp-icon-btn"
            onClick={() => onDuplicate(index)}
            title="Add another runner with the same category and t-shirt size"
          >
            <Copy size={15} aria-hidden="true" />
            <span className="sr-only">Duplicate participant {index + 1}</span>
          </button>
          <button
            type="button"
            className="grp-icon-btn grp-icon-btn--danger"
            onClick={() => onRemove(index)}
            disabled={!canRemove}
            title={canRemove ? 'Remove this participant' : 'A group needs at least one participant'}
          >
            <Trash2 size={15} aria-hidden="true" />
            <span className="sr-only">Remove participant {index + 1}</span>
          </button>
        </span>
      </div>

      <div className="grp-row-grid">
        <Field id={key('firstName')} label="First Name" required error={err('firstName')}>
          {(a11y) => (
            <input {...a11y} type="text" data-field={key('firstName')}
              value={participant.firstName} onChange={set('firstName')}
              className={controlClass(err('firstName'))} />
          )}
        </Field>

        <Field id={key('lastName')} label="Last Name" required error={err('lastName')}>
          {(a11y) => (
            <input {...a11y} type="text" data-field={key('lastName')}
              value={participant.lastName} onChange={set('lastName')}
              className={controlClass(err('lastName'))} />
          )}
        </Field>

        <Field id={key('email')} label="Email" required error={err('email')}>
          {(a11y) => (
            <input {...a11y} type="email" data-field={key('email')}
              value={participant.email} onChange={set('email')}
              className={controlClass(err('email'))} />
          )}
        </Field>

        <Field id={key('phone')} label="Phone" required error={err('phone')}>
          {(a11y) => (
            <input {...a11y} type="tel" data-field={key('phone')}
              value={participant.phone} onChange={set('phone')}
              inputMode="numeric" maxLength={10} placeholder="10-digit mobile"
              className={controlClass(err('phone'))} />
          )}
        </Field>

        <Field
          id={key('dob')}
          label="Date of Birth"
          required
          error={err('dob')}
          hint={age !== null && !Number.isNaN(age) && !err('dob') ? `Age ${age}` : undefined}
        >
          {(a11y) => (
            <input {...a11y} type="date" data-field={key('dob')} max={today}
              value={participant.dob} onChange={set('dob')}
              className={controlClass(err('dob'))} />
          )}
        </Field>

        <Field id={key('gender')} label="Gender" required error={err('gender')}>
          {(a11y) => (
            <select {...a11y} data-field={key('gender')}
              value={participant.gender} onChange={set('gender')}
              className={controlClass(err('gender'))}>
              <option value="">Select…</option>
              {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          )}
        </Field>

        <Field
          id={key('category')}
          label="Category"
          required
          error={err('category')}
          className="grp-field-span"
        >
          {(a11y) => (
            <select {...a11y} data-field={key('category')}
              value={participant.category} onChange={set('category')}
              className={controlClass(err('category'))}>
              <option value="">Select category…</option>
              {categories.map(c => {
                // An age below the minimum disables the option rather than
                // hiding it, so a coordinator who picked the wrong date of
                // birth can see why the category they expected is not offered.
                const tooYoung = age !== null && !Number.isNaN(age) && age < c.minAge;
                const closed = c.status !== 'Open';
                return (
                  <option key={c.id ?? c.name} value={c.name} disabled={tooYoung || closed}>
                    {c.name} — {formatCurrency(c.price)}
                    {closed ? ` (${c.status})` : tooYoung ? ` (min age ${c.minAge})` : ''}
                  </option>
                );
              })}
            </select>
          )}
        </Field>

        <Field id={key('tshirtSize')} label="T-Shirt" required error={err('tshirtSize')}>
          {(a11y) => (
            <select {...a11y} data-field={key('tshirtSize')}
              value={participant.tshirtSize} onChange={set('tshirtSize')}
              className={controlClass(err('tshirtSize'))}>
              <option value="">Size…</option>
              {TSHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </Field>

        <Field id={key('bloodGroup')} label="Blood Group" required error={err('bloodGroup')}>
          {(a11y) => (
            <select {...a11y} data-field={key('bloodGroup')}
              value={participant.bloodGroup} onChange={set('bloodGroup')}
              className={controlClass(err('bloodGroup'))}>
              <option value="">Select…</option>
              {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
        </Field>
      </div>

      <button
        type="button"
        className={`grp-extras-toggle ${isOpen ? 'is-open' : ''}`}
        onClick={() => setShowExtras(o => !o)}
        aria-expanded={isOpen}
        aria-controls={`extras-${index}`}
      >
        <ChevronDown size={15} aria-hidden="true" />
        {isOpen ? 'Hide' : 'Add'} emergency contact, medical notes &amp; finish time
        {extrasHaveError && (
          <span className="grp-extras-flag"><AlertCircle size={13} aria-hidden="true" /> needs attention</span>
        )}
      </button>

      {isOpen && (
        <div className="grp-row-extras" id={`extras-${index}`}>
          <div className="grp-row-grid">
            <Field
              id={key('emergencyContactName')}
              label="Emergency Contact Name"
              error={err('emergencyContactName')}
              hint={captain.emergencyContactName ? `Defaults to ${captain.emergencyContactName}` : undefined}
            >
              {(a11y) => (
                <input {...a11y} type="text" data-field={key('emergencyContactName')}
                  value={participant.emergencyContactName} onChange={set('emergencyContactName')}
                  placeholder={captain.emergencyContactName || 'Who should we call?'}
                  className={controlClass(err('emergencyContactName'))} />
              )}
            </Field>

            <Field
              id={key('emergencyContactNumber')}
              label="Emergency Contact Number"
              error={err('emergencyContactNumber')}
              hint={captain.emergencyContactNumber ? `Defaults to ${captain.emergencyContactNumber}` : undefined}
            >
              {(a11y) => (
                <input {...a11y} type="tel" data-field={key('emergencyContactNumber')}
                  value={participant.emergencyContactNumber} onChange={set('emergencyContactNumber')}
                  inputMode="numeric" maxLength={10}
                  placeholder={captain.emergencyContactNumber || '10-digit mobile'}
                  className={controlClass(err('emergencyContactNumber'))} />
              )}
            </Field>

            <Field
              id={key('estimatedTime')}
              label="Estimated Finish Time"
              error={err('estimatedTime')}
              hint="Optional — helps group the start waves."
            >
              {(a11y) => (
                <input {...a11y} type="text" data-field={key('estimatedTime')}
                  value={participant.estimatedTime} onChange={set('estimatedTime')}
                  placeholder="HH:MM:SS"
                  className={controlClass(err('estimatedTime'))} />
              )}
            </Field>
          </div>

          <label className="reg-checkbox grp-medical-check">
            <input
              type="checkbox"
              checked={participant.hasMedicalCondition}
              onChange={(e) => onChange(index, 'hasMedicalCondition', e.target.checked)}
            />
            <span>This runner has a medical condition or allergy the race team should know about</span>
          </label>

          {participant.hasMedicalCondition && (
            <Field
              id={key('allergies')}
              label="Condition or allergy"
              required
              error={err('allergies')}
              className="grp-field-wide"
            >
              {(a11y) => (
                <textarea {...a11y} rows={2} data-field={key('allergies')}
                  value={participant.allergies} onChange={set('allergies')}
                  placeholder="e.g. asthma — carries an inhaler"
                  className={controlClass(err('allergies'))} />
              )}
            </Field>
          )}
        </div>
      )}
    </li>
  );
}
