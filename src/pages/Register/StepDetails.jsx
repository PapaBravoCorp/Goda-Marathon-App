import React from 'react';
import { Button } from '../../components/Button';
import { Field } from './Field';
import { controlClass } from './controls';
import { INDIAN_STATES } from '../../utils/constants';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

/** Step 2 — who is running, and who to call if something goes wrong. */
export default function StepDetails({
  formData, errors, onChange, onBack, onNext, isCheckingEmail,
}) {
  return (
    <form onSubmit={onNext} className="space-y-8" noValidate>
      <div>
        <h2 className="reg-step-title">Your details</h2>
        <p className="reg-step-subtitle">
          We need these to issue your bib and to reach someone if you need help on the course.
        </p>
      </div>

      <section>
        <h3 className="reg-section-title">Participant</h3>
        <div className="reg-grid">
          <Field id="firstName" label="First Name" required error={errors.firstName}>
            {(a11y) => (
              <input {...a11y} type="text" name="firstName" value={formData.firstName}
                onChange={onChange} placeholder="Asha" autoComplete="given-name"
                className={controlClass(errors.firstName)} />
            )}
          </Field>

          <Field id="lastName" label="Last Name" required error={errors.lastName}>
            {(a11y) => (
              <input {...a11y} type="text" name="lastName" value={formData.lastName}
                onChange={onChange} placeholder="Deshmukh" autoComplete="family-name"
                className={controlClass(errors.lastName)} />
            )}
          </Field>

          <Field
            id="email"
            label="Email Address"
            required
            error={errors.email}
            hint={isCheckingEmail ? 'Checking this email…' : 'Your confirmation and race updates go here.'}
          >
            {(a11y) => (
              <input {...a11y} type="email" name="email" value={formData.email}
                onChange={onChange} placeholder="asha@example.com" autoComplete="email"
                className={controlClass(errors.email)} />
            )}
          </Field>

          <Field id="phone" label="Phone Number" required error={errors.phone}>
            {(a11y) => (
              <input {...a11y} type="tel" name="phone" value={formData.phone}
                onChange={onChange} placeholder="9876543210" autoComplete="tel"
                inputMode="numeric" className={controlClass(errors.phone)} />
            )}
          </Field>

          <Field id="gender" label="Gender" required error={errors.gender}>
            {(a11y) => (
              <select {...a11y} name="gender" value={formData.gender}
                onChange={onChange} className={controlClass(errors.gender)}>
                <option value="">Select…</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other / Prefer not to say</option>
              </select>
            )}
          </Field>
        </div>
      </section>

      <section>
        <h3 className="reg-section-title">Health &amp; safety</h3>
        <p className="reg-section-note">
          Shared only with the medical and rescue teams on race day.
        </p>

        <div className="reg-grid">
          <Field id="bloodGroup" label="Blood Group" required error={errors.bloodGroup}>
            {(a11y) => (
              <select {...a11y} name="bloodGroup" value={formData.bloodGroup}
                onChange={onChange} className={controlClass(errors.bloodGroup)}>
                <option value="">Select…</option>
                {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}
          </Field>

          <div aria-hidden="true" className="reg-spacer" />

          <Field id="emergencyContactName" label="Emergency Contact Name" required error={errors.emergencyContactName}>
            {(a11y) => (
              <input {...a11y} type="text" name="emergencyContactName" value={formData.emergencyContactName}
                onChange={onChange} placeholder="Who should we call?"
                className={controlClass(errors.emergencyContactName)} />
            )}
          </Field>

          <Field
            id="emergencyContactNumber"
            label="Emergency Contact Number"
            required
            error={errors.emergencyContactNumber}
            hint="Must be someone other than you."
          >
            {(a11y) => (
              <input {...a11y} type="tel" name="emergencyContactNumber" value={formData.emergencyContactNumber}
                onChange={onChange} placeholder="9123456780" inputMode="numeric"
                className={controlClass(errors.emergencyContactNumber)} />
            )}
          </Field>
        </div>

        <div className="reg-checkbox-row">
          <label htmlFor="hasMedicalCondition" className="reg-checkbox">
            <input type="checkbox" id="hasMedicalCondition" name="hasMedicalCondition"
              checked={formData.hasMedicalCondition} onChange={onChange} />
            <span>I have a medical condition or allergy the organisers should know about</span>
          </label>
        </div>

        {formData.hasMedicalCondition && (
          <Field id="allergies" label="Please describe it" required error={errors.allergies}>
            {(a11y) => (
              <textarea {...a11y} name="allergies" value={formData.allergies} onChange={onChange}
                rows={3} placeholder="Conditions, allergies, medication…"
                className={controlClass(errors.allergies)} style={{ resize: 'vertical' }} />
            )}
          </Field>
        )}
      </section>

      <section>
        <h3 className="reg-section-title">Address</h3>
        <div className="reg-grid">
          <Field id="state" label="State" required error={errors.state}>
            {(a11y) => (
              <select {...a11y} name="state" value={formData.state}
                onChange={onChange} className={controlClass(errors.state)}>
                <option value="">Select state…</option>
                {INDIAN_STATES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            )}
          </Field>

          <Field id="city" label="City" required error={errors.city}>
            {(a11y) => (
              <input {...a11y} type="text" name="city" value={formData.city}
                onChange={onChange} placeholder="Nashik" autoComplete="address-level2"
                className={controlClass(errors.city)} />
            )}
          </Field>

          <Field id="pincode" label="Pincode" required error={errors.pincode}>
            {(a11y) => (
              <input {...a11y} type="text" name="pincode" value={formData.pincode}
                onChange={onChange} placeholder="422001" inputMode="numeric" maxLength={6}
                autoComplete="postal-code" className={controlClass(errors.pincode)} />
            )}
          </Field>

          <Field id="clubName" label="Running Club / Company" error={errors.clubName} hint="Optional.">
            {(a11y) => (
              <input {...a11y} type="text" name="clubName" value={formData.clubName}
                onChange={onChange} placeholder="Godavari Runners"
                className={controlClass(errors.clubName)} />
            )}
          </Field>
        </div>
      </section>

      <div className="reg-actions">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary" disabled={isCheckingEmail}>
          {isCheckingEmail ? 'Checking…' : 'Continue'}
        </Button>
      </div>
    </form>
  );
}
