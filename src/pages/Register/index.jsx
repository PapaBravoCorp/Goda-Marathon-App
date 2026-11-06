import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader, Users, RotateCcw } from 'lucide-react';

import { CATEGORY_PRICING, CURRENT_EVENT, CATEGORY_RULES } from '../../utils/constants';
import { addRegistration, isEmailRegistered, getEntryBibs } from '../../utils/services/registrations';
import { getEventCategories } from '../../utils/services/categories';
import { getCurrentEvent } from '../../utils/services/events';
import { previewCoupon } from '../../utils/services/coupons';
import {
  isOnlinePaymentEnabled, savePendingPayment, loadPendingPayment, clearPendingPayment,
} from '../../utils/services/payments';
import { isValidPhone, isValidEmail, isValidPincode, calculateAge } from '../../utils/validation';
import { trackEvent } from '../../utils/analytics';
import {
  logRegistrationEvent, flushRegistrationLog, paymentLogFields,
} from '../../utils/services/registrationLog';

import Seo from '../../components/Seo';

import StepRace from './StepRace';
import StepDetails from './StepDetails';
import StepConfirm from './StepConfirm';
import SuccessScreen from './SuccessScreen';
import PaymentPanel from './PaymentPanel';
import usePayment from './usePayment';
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
  const [payer, setPayer] = useState(null);

  const {
    phase: payPhase, message: payMessage, paymentId,
    pay, recheck, cancel: cancelPayment, reset: resetPayment,
  } = usePayment();

  const formRef = useRef(null);
  const age = useMemo(() => calculateAge(formData.dob), [formData.dob]);
  const onlinePayment = isOnlinePaymentEnabled(eventConfig);

  // Who and what the activity log rows are about. Kept in a ref, refreshed
  // after every render, so the logging calls inside the payment callbacks see
  // the latest values without re-creating those callbacks on every keystroke.
  const logContext = useRef({});
  useEffect(() => {
    logContext.current = {
      eventId: eventConfig?.id || CURRENT_EVENT.slug,
      person: {
        email: (formData.email || registration?.email || '').trim(),
        firstName: (formData.firstName || registration?.first_name || '').trim(),
        lastName: (formData.lastName || registration?.last_name || '').trim(),
        phone: formData.phone.trim(),
      },
      category: formData.category || registration?.category,
      registrationId: registration?.id,
      amount: registration?.price,
    };
  });
  const logEvent = useCallback(
    (fields) => logRegistrationEvent({ flow: 'SOLO', ...logContext.current, ...fields }),
    []
  );

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

    // A reservation awaiting payment outranks the draft. Without this, a
    // reload mid-payment lands on the form again, and the email is refused as
    // already registered until the reservation lapses.
    const pending = loadPendingPayment('SOLO');
    if (pending?.registration) {
      setRegistration(pending.registration);
      setPayer(pending.prefill || null);
      setStep(4);
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
    // Activity that could not be sent last time (no network) goes now.
    flushRegistrationLog();
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
          level: c.level || null,
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
        // The likeliest cause with online payment on is the runner's own
        // unfinished attempt from another device. Saying so beats leaving them
        // convinced someone else has their entry.
        const dup = {
          email: onlinePayment
            ? `This email is already registered for this event. If you started registering recently and did not finish paying, that reservation is released after ${eventConfig?.payment_hold_minutes || 30} minutes — try again then.`
            : 'This email is already registered for this event.',
        };
        setErrors(dup);
        focusFirstError(dup);
        trackEvent('registration_validation_failed', { step: 2, fields: ['email'], reason: 'duplicate' });
        logEvent({ stage: 'DETAILS', status: 'FAILED', code: 'EMAIL_TAKEN', shownMessage: dup.email });
        return;
      }
    } finally {
      setIsCheckingEmail(false);
    }

    setErrors({});
    trackEvent('registration_step_completed', { step: 2, city: formData.city, state: formData.state });
    setStep(3);
  };

  /* ── Step 4: payment ──────────────────────────────────────────────────── */

  const handlePaid = useCallback((result) => {
    // `result` is null when the entry was found already paid (the webhook got
    // there first); the reservation already holds everything the success
    // screen shows, so only the status changes.
    setRegistration(prev => ({
      ...prev,
      ...(result?.registration || {}),
      payment_status: 'PAID',
      payment_ref: result?.registration?.payment_ref || result?.paymentId || prev?.payment_ref,
    }));
    clearPendingPayment();
    localStorage.removeItem(DRAFT_KEY);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // An online entry is given its bib when the payment is confirmed, and the
  // "paid" result does not always carry the row (the webhook may have settled
  // it first). Likewise when online payment is switched off mid-payment: the
  // entry becomes an offline one and is numbered then. Ask once for the
  // number the database issued.
  const paidWithoutBib = (registration?.payment_status === 'PAID' || payPhase === 'offline')
    && !!registration?.id && !registration?.bib;
  useEffect(() => {
    if (!paidWithoutBib) return undefined;
    let stale = false;
    getEntryBibs({ registrationId: registration.id })
      .then(([entry]) => {
        if (stale || !entry?.bib) return;
        setRegistration(prev => (prev?.id === entry.id ? { ...prev, bib: entry.bib } : prev));
      })
      .catch(() => { /* the success screen says the number is on its way by email */ });
    return () => { stale = true; };
  }, [paidWithoutBib, registration?.id]);

  const startPayment = useCallback(async (reg, prefill) => {
    trackEvent('payment_started', { flow: 'solo', amount: reg?.price });
    const outcome = await pay({
      registrationId: reg.id,
      dueAt: reg.payment_due_at,
      prefill,
    });
    logEvent({
      stage: 'PAYMENT',
      ...paymentLogFields(outcome),
      registrationId: reg.id,
      amount: reg.price,
      error: outcome.error,
      context: {
        payment_id: outcome.paymentId || outcome.result?.paymentId || undefined,
        service_code: outcome.code || undefined,
      },
    });

    if (outcome.outcome === 'paid') {
      handlePaid(outcome.result);
      trackEvent('payment_completed', { flow: 'solo', amount: reg?.price });
    } else {
      // Nothing left to resume. The draft stays for a lapsed reservation (so
      // "Start again" has the details) but goes when online payment was
      // switched off, because that entry stands as an ordinary pending one.
      if (['EXPIRED', 'NOT_PAYABLE', 'NOT_FOUND', 'DISABLED'].includes(outcome.code)) {
        clearPendingPayment();
      }
      if (outcome.code === 'DISABLED') localStorage.removeItem(DRAFT_KEY);
      trackEvent('payment_not_completed', { flow: 'solo', outcome: outcome.outcome, reason: outcome.code });
    }
  }, [pay, handlePaid, logEvent]);

  const recheckPayment = useCallback(async () => {
    const outcome = await recheck();
    if (outcome) {
      logEvent({
        stage: 'PAYMENT',
        ...paymentLogFields(outcome),
        context: { recheck: true, payment_id: outcome.paymentId || undefined },
      });
    }
    if (outcome?.outcome === 'paid') handlePaid(outcome.result);
  }, [recheck, handlePaid, logEvent]);

  /**
   * The reservation lapsed. The draft was kept until payment for exactly this:
   * the runner goes back to the confirm step with every field still filled in,
   * and resubmitting sweeps the old reservation and takes a new one.
   */
  const startOver = useCallback(() => {
    clearPendingPayment();
    resetPayment();
    setRegistration(null);
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [resetPayment]);

  /**
   * The runner released their reservation. It is cancelled on the server, not
   * just forgotten here -- otherwise resubmitting with a corrected name or
   * category would be refused as "already registered" until the hold lapsed.
   * They land on step 1 with every field still filled in.
   */
  const cancelReservation = useCallback(async () => {
    const result = await cancelPayment({ registrationId: registration?.id });
    logEvent({
      stage: 'CANCEL',
      ...(result.status === 'CANCELLED' || result.status === 'NOT_FOUND'
        ? { status: 'ABANDONED', code: 'RUNNER_CANCELLED' }
        : result.status === 'PAID'
          ? { status: 'INFO', code: 'PAID_BEFORE_CANCEL' }
          : { status: 'FAILED', code: `CANCEL_${result.status || 'ERROR'}` }),
    });

    if (result.status === 'PAID') {
      // The payment landed first. Show the confirmation, not the form.
      handlePaid({ paymentId: result.payment_ref });
      return;
    }

    if (result.status === 'CANCELLED' || result.status === 'NOT_FOUND') {
      clearPendingPayment();
      resetPayment();
      setRegistration(null);
      setStep(1);
      setNotice('Your reservation was cancelled and nothing was charged. Change anything below and submit again, or use “Clear form” to start a new registration.');
      trackEvent('reservation_cancelled', { flow: 'solo' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [cancelPayment, registration?.id, handlePaid, resetPayment, logEvent]);

  // Anything typed or ticked -- the draft restore can bring back someone
  // else's details on a shared computer, which is when this matters most.
  const formHasData = Object.keys(EMPTY_FORM).some(k => formData[k] !== EMPTY_FORM[k])
    || Object.values(waivers).some(Boolean);

  const clearForm = () => {
    if (!window.confirm('Clear everything you have entered and start a new registration?')) return;
    setFormData(EMPTY_FORM);
    setWaivers(EMPTY_WAIVERS);
    setErrors({});
    setSubmitError('');
    setNotice('');
    setCouponQuote(null);
    localStorage.removeItem(DRAFT_KEY);
    setStep(1);
    trackEvent('registration_form_cleared', {});
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      trackEvent('registration_completed', {
        category: formData.category,
        price: saved?.price,
      });
      logEvent({
        stage: 'SUBMIT',
        status: 'OK',
        code: saved?.payment_status,
        registrationId: saved?.id,
        amount: saved?.price,
        context: {
          coupon: saved?.coupon_code || undefined,
          discount: Number(saved?.discount) || undefined,
          payment_due_at: saved?.payment_due_at || undefined,
        },
      });
      setStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // A deadline means online payment is on and something is owed. Checkout
      // opens straight away -- the button they pressed said "Continue to
      // payment". The draft is kept until the payment lands, so a lapsed
      // reservation can be resubmitted without retyping anything.
      if (saved?.payment_status === 'PENDING' && saved?.payment_due_at) {
        const prefill = {
          name: `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim(),
          email: formData.email.trim(),
          contact: formData.phone.trim(),
        };
        setPayer(prefill);
        savePendingPayment('SOLO', { registration: saved, prefill, dueAt: saved.payment_due_at });
        startPayment(saved, prefill);
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (err) {
      // The service turns each database error code into a sentence the runner
      // can act on -- "that category just filled up" rather than a stack trace.
      const shown = err.code === 'UNKNOWN'
        ? 'Something went wrong saving your registration. Please try again — your details are still here.'
        : err.message;
      setSubmitError(shown);
      logEvent({
        stage: 'SUBMIT',
        status: 'FAILED',
        error: err,
        shownMessage: shown,
        context: { coupon: formData.couponCode.trim() || undefined },
      });

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

  // Reserved, owing money, and online payment still available. When an admin
  // switches online payment off mid-way the entry is an ordinary PENDING one,
  // and the success screen's "we will contact you" is the right thing to show.
  const awaitingPayment = registration?.payment_status === 'PENDING'
    && !!registration?.payment_due_at && payPhase !== 'offline';

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

        {step < 4 && formHasData && (
          <div className="reg-toolbar">
            <button type="button" className="reg-clear-btn" onClick={clearForm}>
              <RotateCcw size={14} aria-hidden="true" /> Clear form
            </button>
          </div>
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
              onlinePayment={onlinePayment}
              holdMinutes={eventConfig?.payment_hold_minutes}
            />
          )}

          {step === 4 && awaitingPayment && (
            <PaymentPanel
              amount={registration.price}
              dueAt={registration.payment_due_at}
              summary={[
                { label: 'Runner', value: `${registration.first_name || ''} ${registration.last_name || ''}`.trim() },
                { label: 'Category', value: registration.category },
                ...(Number(registration.discount) > 0
                  ? [{ label: `Discount (${registration.coupon_code})`, value: `− ${formatCurrency(registration.discount)}` }]
                  : []),
              ]}
              phase={payPhase}
              message={payMessage}
              paymentId={paymentId}
              onPay={() => startPayment(registration, payer || { email: registration.email })}
              onRecheck={recheckPayment}
              onStartOver={startOver}
              onCancel={cancelReservation}
              formatCurrency={formatCurrency}
              contactEmail={eventConfig?.contact_email}
              contactPhone={eventConfig?.contact_phone}
            />
          )}

          {step === 4 && !awaitingPayment && (
            <SuccessScreen
              registration={registration}
              eventName={eventConfig?.name || CURRENT_EVENT.name}
              contactEmail={eventConfig?.contact_email}
              contactPhone={eventConfig?.contact_phone}
              emailsEnabled={eventConfig?.confirmation_emails_enabled === true}
            />
          )}
        </div>
      </div>
    </div>
  );
}
