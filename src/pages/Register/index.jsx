import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader, Users } from 'lucide-react';

import { CATEGORY_PRICING, CURRENT_EVENT, CATEGORY_RULES } from '../../utils/constants';
import { addRegistration, isEmailRegistered } from '../../utils/services/registrations';
import { getEventCategories } from '../../utils/services/categories';
import { getCurrentEvent } from '../../utils/services/events';
import { previewCoupon } from '../../utils/services/coupons';
import { isValidPhone, isValidEmail, isValidPincode, calculateAge } from '../../utils/validation';
import { trackEvent } from '../../utils/analytics';

import Seo from '../../components/Seo';

import StepRace from './StepRace';
import StepDetails from './StepDetails';
import StepConfirm from './StepConfirm';
import SuccessScreen from './SuccessScreen';
import './Register.css';

const DRAFT_KEY = 'goda-registration-draft';

const STEPS = [
  { num: 1, label: 'Race' },
  { num: 2, label: 'Details' },
  { num: 3, label: 'Confirm' },
];

const EMPTY_FORM = {
  firstName: '', lastName: '', email: '', phone: '',
  dob: '', gender: '', bloodGroup: '',
  emergencyContactName: '', emergencyContactNumber: '',
  city: '', state: '', pincode: '', clubName: '',
  hasMedicalCondition: false, allergies: '',
  category: '', tshirtSize: '', estimatedTime: '', couponCode: '',
};

const EMPTY_WAIVERS = {
  isMedicallyFit: false,
  acceptsRisk: false,
  acceptsRefundPolicy: false,
  consentsToMedia: false,
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

export default function Register() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [waivers, setWaivers] = useState(EMPTY_WAIVERS);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [notice, setNotice] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [dbCategories, setDbCategories] = useState([]);
  const [eventConfig, setEventConfig] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [couponQuote, setCouponQuote] = useState(null);

  const formRef = useRef(null);
  const age = useMemo(() => calculateAge(formData.dob), [formData.dob]);

  /* ── Load event + categories, restore any draft ───────────────────────── */

  useEffect(() => {
    let cancelled = false;

    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const { savedStep, savedFormData, savedWaivers } = JSON.parse(saved);
        if (savedFormData) setFormData(prev => ({ ...prev, ...savedFormData }));
        if (savedWaivers) setWaivers(prev => ({ ...prev, ...savedWaivers }));
        if (savedStep && savedStep < 4) setStep(savedStep);
      } catch (err) {
        console.error('Failed to parse registration draft', err);
      }
    }

    (async () => {
      try {
        const ev = await getCurrentEvent();
        if (cancelled) return;
        setEventConfig(ev);
        if (ev?.id) {
          const cats = await getEventCategories(ev.id, ev.id);
          if (!cancelled) setDbCategories(cats);
        }
      } catch (err) {
        console.error('Failed to load event config', err);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();

    trackEvent('registration_started', { eventName: CURRENT_EVENT.name });
    return () => { cancelled = true; };
  }, []);

  // Persist the draft, but never the completed state.
  useEffect(() => {
    if (isLoaded && step < 4) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedStep: step, savedFormData: formData, savedWaivers: waivers,
      }));
    }
  }, [formData, step, waivers, isLoaded]);

  /* ── Categories, normalised ───────────────────────────────────────────── */

  const categories = useMemo(() => {
    if (dbCategories.length > 0) {
      return dbCategories.map(c => {
        // slots_left is computed by the database in get_category_availability;
        // the fallback covers a category row that predates that function.
        const slotsLeft = c.slots_left ?? (
          c.max_slots == null ? null : Math.max(c.max_slots - (c.registration_count || 0), 0)
        );
        return {
          id: c.id,
          name: c.name,
          price: c.price,
          minAge: c.min_age || 5,
          distance: c.distance,
          elevation: c.elevation,
          slotsLeft,
          status: slotsLeft === 0 ? 'Sold Out' : (c.status || 'Open'),
        };
      });
    }
    // Legacy fallback while event_categories is empty.
    return Object.keys(CATEGORY_PRICING).map(name => ({
      id: name,
      name,
      price: CATEGORY_PRICING[name],
      minAge: CATEGORY_RULES[name]?.minAge || 5,
      distance: null,
      elevation: null,
      slotsLeft: null,
      status: 'Open',
    }));
  }, [dbCategories]);

  const selectedCategory = useMemo(
    () => categories.find(c => c.name === formData.category) || null,
    [categories, formData.category]
  );

  /**
   * A draft can outlive the category it points at — categories are renamed and
   * removed from the admin panel. Without this, a restored draft could reach the
   * confirm step with no matching category and submit at a price of zero.
   */
  useEffect(() => {
    if (!isLoaded || step === 1 || step === 4) return;
    if (!formData.category) return;
    if (categories.length === 0) return;
    if (categories.some(c => c.name === formData.category)) return;

    setFormData(prev => ({ ...prev, category: '' }));
    setStep(1);
    setNotice('The category you had chosen is no longer available. Please pick another.');
  }, [isLoaded, step, formData.category, categories]);

  /**
   * Quote the coupon on the confirm step.
   *
   * The code used to be stored and nothing more — the form said "checked by the
   * organisers", so a runner learned what they actually owed when the payment
   * request arrived. The database now prices it, and this shows the same figure
   * that create_registration() will store: both call evaluate_coupon(), so the
   * screen and the row cannot disagree.
   */
  useEffect(() => {
    if (step !== 3) return;

    const code = formData.couponCode.trim();
    if (!code || !formData.category) { setCouponQuote(null); return; }

    let cancelled = false;
    (async () => {
      const q = await previewCoupon(
        code,
        eventConfig?.id || CURRENT_EVENT.slug,
        [formData.category],
        false
      );
      if (!cancelled) setCouponQuote(q);
    })();

    return () => { cancelled = true; };
  }, [step, formData.couponCode, formData.category, eventConfig]);

  /* ── Field helpers ────────────────────────────────────────────────────── */

  const clearError = useCallback((name) => {
    setErrors(prev => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    clearError(name);
    setNotice('');
  }, [clearError]);

  const handleSelectCategory = useCallback((name) => {
    setFormData(prev => ({ ...prev, category: name }));
    clearError('category');
    trackEvent('category_selected', { category: name });
  }, [clearError]);

  const handleWaiverChange = useCallback((e) => {
    const { name, checked } = e.target;
    setWaivers(prev => ({ ...prev, [name]: checked }));
    clearError('waivers');
  }, [clearError]);

  /**
   * Put the runner on the first thing that needs fixing. Reporting problems
   * without moving focus leaves them hunting for the field, especially on a
   * phone where the error may be off screen.
   */
  const focusFirstError = useCallback((fieldErrors) => {
    const firstKey = Object.keys(fieldErrors)[0];
    if (!firstKey) return;
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector(`[name="${firstKey}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus({ preventScroll: true });
      } else {
        formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });
  }, []);

  /* ── Step 1: race ─────────────────────────────────────────────────────── */

  const submitRace = (e) => {
    e.preventDefault();
    const next = {};

    if (!formData.dob) {
      next.dob = 'Enter your date of birth.';
    } else if (age === null || Number.isNaN(age)) {
      next.dob = 'That date does not look right.';
    } else if (age < 0 || age > 120) {
      next.dob = 'Check the year — that age is out of range.';
    }

    if (!formData.category) {
      next.category = 'Choose a race category.';
    } else if (selectedCategory) {
      if (age !== null && age < selectedCategory.minAge) {
        next.category = `${selectedCategory.name} is for runners aged ${selectedCategory.minAge} and over.`;
      } else if (selectedCategory.status !== 'Open') {
        next.category = `${selectedCategory.name} is ${selectedCategory.status.toLowerCase()}.`;
      }
    }

    if (!formData.tshirtSize) next.tshirtSize = 'Pick a t-shirt size.';

    if (formData.estimatedTime && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(formData.estimatedTime.trim())) {
      next.estimatedTime = 'Use HH:MM or HH:MM:SS, or leave it blank.';
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      focusFirstError(next);
      trackEvent('registration_validation_failed', { step: 1, fields: Object.keys(next) });
      return;
    }

    setErrors({});
    trackEvent('registration_step_completed', { step: 1, category: formData.category, age });
    setStep(2);
  };

  /* ── Step 2: details ──────────────────────────────────────────────────── */

  const submitDetails = async (e) => {
    e.preventDefault();
    const next = {};

    if (!formData.firstName.trim()) next.firstName = 'Enter your first name.';
    if (!formData.lastName.trim()) next.lastName = 'Enter your last name.';

    if (!formData.email.trim()) next.email = 'Enter your email address.';
    else if (!isValidEmail(formData.email.trim())) next.email = 'That email address does not look valid.';

    if (!formData.phone.trim()) next.phone = 'Enter your phone number.';
    else if (!isValidPhone(formData.phone.trim())) next.phone = 'Enter a 10-digit Indian mobile number.';

    if (!formData.gender) next.gender = 'Select an option.';
    if (!formData.bloodGroup) next.bloodGroup = 'Select your blood group.';

    if (!formData.emergencyContactName.trim()) {
      next.emergencyContactName = 'Enter an emergency contact name.';
    }

    if (!formData.emergencyContactNumber.trim()) {
      next.emergencyContactNumber = 'Enter an emergency contact number.';
    } else if (!isValidPhone(formData.emergencyContactNumber.trim())) {
      next.emergencyContactNumber = 'Enter a 10-digit Indian mobile number.';
    } else if (formData.emergencyContactNumber.trim() === formData.phone.trim()) {
      next.emergencyContactNumber = 'This must be someone other than you.';
    }

    if (formData.hasMedicalCondition && !formData.allergies.trim()) {
      next.allergies = 'Describe the condition so the medical team knows.';
    }

    if (!formData.state) next.state = 'Select your state.';
    if (!formData.city.trim()) next.city = 'Enter your city.';

    if (!formData.pincode.trim()) next.pincode = 'Enter your pincode.';
    else if (!isValidPincode(formData.pincode.trim())) next.pincode = 'Enter a valid 6-digit pincode.';

    if (Object.keys(next).length > 0) {
      setErrors(next);
      focusFirstError(next);
      trackEvent('registration_validation_failed', { step: 2, fields: Object.keys(next) });
      return;
    }

    // Catch a duplicate here rather than after the declarations are signed.
    setIsCheckingEmail(true);
    try {
      const taken = await isEmailRegistered(formData.email.trim(), CURRENT_EVENT.slug);
      if (taken) {
        const dup = { email: 'This email is already registered for this event.' };
        setErrors(dup);
        focusFirstError(dup);
        trackEvent('registration_validation_failed', { step: 2, fields: ['email'], reason: 'duplicate' });
        return;
      }
    } finally {
      setIsCheckingEmail(false);
    }

    setErrors({});
    trackEvent('registration_step_completed', { step: 2, city: formData.city, state: formData.state });
    setStep(3);
  };

  /* ── Step 3: confirm ──────────────────────────────────────────────────── */

  const submitRegistration = async (e) => {
    e.preventDefault();
    setSubmitError('');

    const allAccepted = Object.values(waivers).every(Boolean);
    if (!allAccepted) {
      const next = { waivers: 'Please accept all four declarations to continue.' };
      setErrors(next);
      trackEvent('registration_validation_failed', { step: 3, fields: ['waivers'] });
      requestAnimationFrame(() => {
        formRef.current?.querySelector('.reg-declarations')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      // No price is sent. create_registration() reads it from event_categories:
      // a price posted from the browser is a price the runner can edit.
      const saved = await addRegistration({
        ...formData,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        emergencyContactNumber: formData.emergencyContactNumber.trim(),
        city: formData.city.trim(),
        pincode: formData.pincode.trim(),
        clubName: formData.clubName.trim(),
        waiversAccepted: true,
        eventId: eventConfig?.id || CURRENT_EVENT.slug,
      });

      setRegistration(saved);
      localStorage.removeItem(DRAFT_KEY);
      trackEvent('registration_completed', {
        category: formData.category,
        price: saved?.price,
      });
      setStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      // The service turns each database error code into a sentence the runner
      // can act on -- "that category just filled up" rather than a stack trace.
      setSubmitError(
        err.code === 'UNKNOWN'
          ? 'Something went wrong saving your registration. Please try again — your details are still here.'
          : err.message
      );

      // A category that filled or closed while the form was open is worth
      // sending them back to step 1 for, rather than leaving them on a submit
      // button that cannot succeed.
      if (err.code === 'CATEGORY_FULL' || err.code === 'CATEGORY_UNAVAILABLE' || err.code === 'CATEGORY_NOT_FOUND') {
        setFormData(prev => ({ ...prev, category: '' }));
        setStep(1);
        setNotice(err.message);
        const ev = await getCurrentEvent();
        if (ev?.id) setDbCategories(await getEventCategories(ev.id, ev.id));
      }

      trackEvent('registration_failed', { category: formData.category, reason: err.code });
    } finally {
      setIsSubmitting(false);
    }
  };

  const goBack = (target) => {
    setErrors({});
    setSubmitError('');
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (!isLoaded) {
    return (
      <div className="reg-loading">
        <Loader size={32} className="spin" aria-hidden="true" />
        <p>Loading registration…</p>
      </div>
    );
  }

  if (eventConfig && eventConfig.registration_open === false) {
    return (
      <div className="reg-page">
        <div className="reg-shell glass reg-closed">
          <h2>Registration closed</h2>
          <p>
            Registration for {eventConfig.name} is not open at the moment.
            Thank you for your interest — check the event page for updates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="reg-page">
      <Seo
        title="Register"
        description={`Enter the ${eventConfig?.name || CURRENT_EVENT.name}. Choose your distance, give your details and reserve your place.`}
      />
      <div className="reg-container">
        {/* Above the step indicator, not at the foot of step 1 where it was.
            A restored draft starts the runner on step 2 or 3, so a link that
            lives inside step 1 is invisible to exactly the returning visitor
            most likely to be organising a team. Hidden from step 3 onward:
            past the confirm screen, switching would discard what they typed,
            and a second group entry can always be made afterwards. */}
        {step < 3 && (
          <p className="reg-group-link">
            <Users size={16} aria-hidden="true" />
            <span>
              Entering a club, company or school team?{' '}
              <Link to="/register/group">Register as a group</Link> — one form,
              one payment, and group discount codes apply.
            </span>
          </p>
        )}

        {step < 4 && (
          <ol className="reg-steps" aria-label="Registration progress">
            {STEPS.map(s => (
              <li
                key={s.num}
                className={`reg-step ${step === s.num ? 'is-current' : ''} ${step > s.num ? 'is-done' : ''}`}
                aria-current={step === s.num ? 'step' : undefined}
              >
                <span className="reg-step-num">{s.num}</span>
                <span className="reg-step-label">{s.label}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="reg-shell glass" ref={formRef}>
          {notice && <p className="reg-notice" role="status">{notice}</p>}

          {step === 1 && (
            <StepRace
              formData={formData}
              errors={errors}
              age={age}
              categories={categories}
              onChange={handleChange}
              onSelectCategory={handleSelectCategory}
              onNext={submitRace}
              formatCurrency={formatCurrency}
            />
          )}

          {step === 2 && (
            <StepDetails
              formData={formData}
              errors={errors}
              onChange={handleChange}
              onBack={() => goBack(1)}
              onNext={submitDetails}
              isCheckingEmail={isCheckingEmail}
            />
          )}

          {step === 3 && (
            <StepConfirm
              formData={formData}
              waivers={waivers}
              errors={errors}
              category={selectedCategory}
              couponQuote={couponQuote}
              onWaiverChange={handleWaiverChange}
              onBack={() => goBack(2)}
              onSubmit={submitRegistration}
              isSubmitting={isSubmitting}
              formatCurrency={formatCurrency}
              submitError={submitError}
            />
          )}

          {step === 4 && (
            <SuccessScreen
              registration={registration}
              eventName={eventConfig?.name || CURRENT_EVENT.name}
              contactEmail={eventConfig?.contact_email}
              contactPhone={eventConfig?.contact_phone}
            />
          )}
        </div>
      </div>
    </div>
  );
}
