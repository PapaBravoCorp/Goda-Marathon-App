import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Info } from 'lucide-react';

import { Button } from '../../../components/Button';
import { Field } from '../Field';
import { controlClass } from '../controls';
import { INDIAN_STATES } from '../../../utils/constants';

/**
 * Step 1 — who is entering the group.
 *
 * The coordinator is not assumed to be running. A club secretary or an HR lead
 * frequently enters a team they are not part of, so nothing here creates a
 * registration; they add themselves as a participant on the next step if they
 * are taking part.
 *
 * The address and emergency contact are collected once here and inherited by
 * every participant who does not give their own, which is what makes the
 * roster on step 2 short enough to fill in for twenty people.
 */
export default function StepCoordinator({ captain, errors, onChange, onNext }) {
  return (
    <form onSubmit={onNext} className="space-y-8" noValidate>
      <div>
        <h2 className="reg-step-title">Group registration</h2>
        <p className="reg-step-subtitle">
          Enter a club, company, school or family team in one go — and apply a
          group discount code if you have one.
        </p>
      </div>

      <div className="grp-intro">
        <Users size={20} aria-hidden="true" />
        <div>
          <strong>How this works</strong>
          <p>
            You give your details once, then add each runner with just their
            name, contact, date of birth, category and t-shirt size. Everyone
            gets their own bib number. One invoice covers the whole team.
          </p>
          <p className="grp-intro-alt">
            Entering by yourself? <Link to="/register">Use the individual form</Link> instead.
          </p>
        </div>
      </div>

      <section>
        <h3 className="reg-section-title">Your details</h3>
        <p className="reg-section-note">
          We contact you — not each runner — about payment and race-day logistics.
        </p>

        <div className="reg-grid">
          <Field id="firstName" label="First Name" required error={errors.firstName}>
            {(a11y) => (
              <input {...a11y} type="text" name="firstName" value={captain.firstName}
                onChange={onChange} autoComplete="given-name"
                className={controlClass(errors.firstName)} />
            )}
          </Field>

          <Field id="lastName" label="Last Name" required error={errors.lastName}>
            {(a11y) => (
              <input {...a11y} type="text" name="lastName" value={captain.lastName}
                onChange={onChange} autoComplete="family-name"
                className={controlClass(errors.lastName)} />
            )}
          </Field>

          <Field id="email" label="Email" required error={errors.email}
            hint="Payment instructions and the group summary go here.">
            {(a11y) => (
              <input {...a11y} type="email" name="email" value={captain.email}
                onChange={onChange} autoComplete="email"
                className={controlClass(errors.email)} />
            )}
          </Field>

          <Field id="phone" label="Phone" required error={errors.phone}>
            {(a11y) => (
              <input {...a11y} type="tel" name="phone" value={captain.phone}
                onChange={onChange} inputMode="numeric" maxLength={10} autoComplete="tel"
                placeholder="10-digit mobile"
                className={controlClass(errors.phone)} />
            )}
          </Field>
        </div>

        <Field id="organisationName" label="Club / Company / Team Name" required
          error={errors.organisationName}
          hint="Shown against every member of this group."
          className="grp-field-wide">
          {(a11y) => (
            <input {...a11y} type="text" name="organisationName" value={captain.organisationName}
              onChange={onChange} placeholder="e.g. Nashik Runners Club"
              className={controlClass(errors.organisationName)} />
          )}
        </Field>
      </section>

      <section>
        <h3 className="reg-section-title">Address</h3>
        <p className="reg-section-note">
          Applied to every participant. Individual runners can be corrected later.
        </p>

        <div className="reg-grid">
          <Field id="state" label="State" required error={errors.state}>
            {(a11y) => (
              <select {...a11y} name="state" value={captain.state}
                onChange={onChange} className={controlClass(errors.state)}>
                <option value="">Select state…</option>
                {INDIAN_STATES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            )}
          </Field>

          <Field id="city" label="City" required error={errors.city}>
            {(a11y) => (
              <input {...a11y} type="text" name="city" value={captain.city}
                onChange={onChange} autoComplete="address-level2"
                className={controlClass(errors.city)} />
            )}
          </Field>

          <Field id="pincode" label="Pincode" required error={errors.pincode}>
            {(a11y) => (
              <input {...a11y} type="text" name="pincode" value={captain.pincode}
                onChange={onChange} inputMode="numeric" maxLength={6} autoComplete="postal-code"
                className={controlClass(errors.pincode)} />
            )}
          </Field>
        </div>
      </section>

      <section>
        <h3 className="reg-section-title">Fallback emergency contact</h3>
        <p className="reg-section-note">
          Used for any runner who does not give their own. Shared only with the
          medical and rescue teams on race day.
        </p>

        <div className="reg-grid">
          <Field id="emergencyContactName" label="Contact Name" required
            error={errors.emergencyContactName}>
            {(a11y) => (
              <input {...a11y} type="text" name="emergencyContactName"
                value={captain.emergencyContactName} onChange={onChange}
                placeholder="Who should we call?"
                className={controlClass(errors.emergencyContactName)} />
            )}
          </Field>

          <Field id="emergencyContactNumber" label="Contact Number" required
            error={errors.emergencyContactNumber}>
            {(a11y) => (
              <input {...a11y} type="tel" name="emergencyContactNumber"
                value={captain.emergencyContactNumber} onChange={onChange}
                inputMode="numeric" maxLength={10} placeholder="10-digit mobile"
                className={controlClass(errors.emergencyContactNumber)} />
            )}
          </Field>
        </div>

        <div className="reg-payment-note grp-note-compact">
          <Info size={18} aria-hidden="true" />
          <div>
            <p>
              Please encourage each runner to add their own next-of-kin on the
              next step. Yours is the fallback, not the intended answer.
            </p>
          </div>
        </div>
      </section>

      <div className="reg-actions reg-actions--end">
        <Button type="submit" variant="primary">Continue to participants</Button>
      </div>
    </form>
  );
}
