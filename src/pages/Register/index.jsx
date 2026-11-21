import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Loader, Users, RotateCcw, Tag } from 'lucide-react';

import { CATEGORY_PRICING, CURRENT_EVENT, CATEGORY_RULES } from '../../utils/constants';
import { addRegistration, isEmailRegistered, getEntryBibs } from '../../utils/services/registrations';
import { getEventCategories } from '../../utils/services/categories';
import { getCurrentEvent } from '../../utils/services/events';
import { previewCoupon, describeCouponReason } from '../../utils/services/coupons';
import {
  isOnlinePaymentEnabled, savePendingPayment, loadPendingPayment, clearPendingPayment,
} from '../../utils/services/payments';
import { isValidPhone, isValidEmail, isValidPincode, calculateAge } from '../../utils/validation';
import { trackEvent, trackConversion } from '../../utils/analytics';
import { normaliseCode, takeFreshLinkCode, dealFor } from '../../utils/offer';
import { useAutoOffer, useCodeQuotes } from '../../utils/useOffer';

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
  // True once the runner has typed in the code field (or arrived with a draft
  // that already held a code). From then on the field is theirs: the offer is
  // suggested, never written over what they entered.
  const [couponTouched, setCouponTouched] = useState(false);
  const [payer, setPayer] = useState(null);

  const {
    phase: payPhase, message: payMessage, paymentId,
    pay, recheck, cancel: cancelPayment, reset: resetPayment,
  } = usePayment();

  const formRef = useRef(null);
  const age = useMemo(() => calculateAge(formData.dob), [formData.dob]);
  const onlinePayment = isOnlinePaymentEnabled(eventConfig);

  /* ── Load event + categories, restore any draft ───────────────────────── */

  useEffect(() => {
    let cancelled = false;

    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const { savedStep, savedFormData, savedWaivers, savedCouponTouched } = JSON.parse(saved);
        if (savedFormData) setFormData(prev => ({ ...prev, ...savedFormData }));
        // A draft from before codes were applied automatically has no flag;
        // a code in it can only have been typed.
        setCouponTouched(savedCouponTouched ?? !!savedFormData?.couponCode);
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
    return () => { cancelled = true; };
  }, []);

  // Persist the draft, but never the completed state.
  useEffect(() => {
    if (isLoaded && step < 4) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedStep: step, savedFormData: formData, savedWaivers: waivers,
        savedCouponTouched: couponTouched,
      }));
    }
  }, [formData, step, waivers, isLoaded, couponTouched]);

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

  /* ── The offer: a code applied without typing ─────────────────────────── */

  // Quotes exist only for categories the database knows; the legacy fallback
  // list has no rows to price a code against.
  const offerCategories = dbCategories.length > 0 ? categories : [];
  const offerEventId = eventConfig?.id || '';

  // The link code or the event's featured code, whichever takes something off.
  const { ready: autoReady, offer: autoOffer } = useAutoOffer(eventConfig, offerCategories);
  // Whatever is in the code field right now, priced per category for the cards.
  const typed = useCodeQuotes(formData.couponCode, offerEventId, offerCategories);

  const autoCode = autoOffer?.code || '';
  const currentCode = normaliseCode(formData.couponCode);
  // An untouched field is about to hold the offer (the effect below writes it
  // in), so it is treated as holding it already: the cards go straight to the
  // discounted price instead of showing the list price for a moment first.
  const showingAuto = !!autoCode && (couponTouched ? currentCode === autoCode : true);
  // The auto offer's own quotes are already in hand, so the cards do not wait
  // for the debounced lookup when the field holds that code.
  const activeQuotes = showingAuto ? autoOffer.quotes : typed.quotes;
  const activeSummary = showingAuto ? autoOffer.summary : typed.summary;
  const quotesReady = showingAuto || typed.ready;

  // What the chosen entry costs with the code in the field, for the ad
  // analytics only. The database prices the real entry when it is submitted.
  const entryValue = useMemo(() => {
    if (!selectedCategory) return undefined;
    const deal = dealFor(activeQuotes, selectedCategory.name, selectedCategory.price);
    return deal ? deal.price : Number(selectedCategory.price) || 0;
  }, [selectedCategory, activeQuotes]);

  /**
   * Put the offer in the code field for a runner who has not used it.
   *
   * Waits for the quote, so a featured code that has expired, or one that is
   * for groups only, is never written into a field the runner did not touch --
   * they would be told "that code has expired" about a code they never typed.
   * An untouched field is also kept in step: when the featured code changes
   * between visits, a returning runner's draft moves to the new one.
   */
  useEffect(() => {
    if (!isLoaded || step === 4 || offerCategories.length === 0 || !autoReady) return;

    // Arriving by link is deliberate, and outranks a code left in a draft.
    const fresh = takeFreshLinkCode();
    if (fresh && fresh === autoCode) {
      setCouponTouched(false);
      setFormData(prev => (prev.couponCode === autoCode ? prev : { ...prev, couponCode: autoCode }));
      trackEvent('offer_auto_applied', { code: autoCode, source: 'link' });
      return;
    }

    if (couponTouched) return;
    if (formData.couponCode !== autoCode) {
      setFormData(prev => ({ ...prev, couponCode: autoCode }));
      if (autoCode) trackEvent('offer_auto_applied', { code: autoCode, source: autoOffer?.source });
    }
  }, [isLoaded, step, offerCategories.length, autoReady, autoCode, autoOffer?.source, couponTouched, formData.couponCode]);

  const applyOffer = useCallback(() => {
    if (!autoCode) return;
    setCouponTouched(false);
    setFormData(prev => ({ ...prev, couponCode: autoCode }));
    trackEvent('offer_applied_from_strip', { code: autoCode });
  }, [autoCode]);

  // What the code field says about the code in it. Nothing while it is being
  // checked, and nothing for a network failure: the confirm step quotes again.
  const couponStatus = useMemo(() => {
    if (!currentCode || !quotesReady) return null;
    if (activeSummary) {
      const chosen = formData.category ? activeQuotes[formData.category] : null;
      if (chosen && !chosen.valid && chosen.reason !== 'PREVIEW_FAILED') {
        return { ok: false, text: describeCouponReason(chosen) };
      }
      return {
        ok: true,
        text: `${activeSummary.code} applied: ${activeSummary.label}${activeSummary.appliesToAll ? '' : ' on selected categories'}.`,
      };
    }
    const refusal = Object.values(activeQuotes).find(q => q && !q.valid && q.reason !== 'PREVIEW_FAILED');
    return refusal ? { ok: false, text: describeCouponReason(refusal) } : null;
  }, [currentCode, quotesReady, activeSummary, activeQuotes, formData.category]);

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
    if (name === 'couponCode') {
      // Uppercased as it is typed, as the group form does: the database matches
      // codes case-insensitively, and one spelling on screen avoids doubt.
      setCouponTouched(true);
      setFormData(prev => ({ ...prev, couponCode: value.toUpperCase() }));
    } else {
      setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }
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
    trackEvent('registration_step_completed', { step: 1, category: formData.category, age, value: entryValue });
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
        return;
      }
    } finally {
      setIsCheckingEmail(false);
    }

    setErrors({});
    trackEvent('registration_step_completed', {
      step: 2, category: formData.category, value: entryValue, city: formData.city, state: formData.state,
    });
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

  // Purchase / CompleteRegistration for the ad analytics, once the entry is
  // really confirmed: paid by whichever route the payment landed (Checkout,
  // "check again", the webhook first, or found paid when cancelling), or
  // saved with online payment off. trackConversion() sends once per entry.
  const entryConfirmed = registration?.payment_status === 'PAID'
    || (!!registration?.id && registration?.payment_status === 'PENDING'
      && (!registration?.payment_due_at || payPhase === 'offline'));
  useEffect(() => {
    if (!entryConfirmed || !registration?.id) return;
    trackConversion({
      id: registration.id,
      flow: 'solo',
      paid: registration.payment_status === 'PAID',
      value: registration.price,
      categories: [registration.category || formData.category],
    });
  }, [entryConfirmed, registration?.id, registration?.payment_status, registration?.price, registration?.category, formData.category]);

  const startPayment = useCallback(async (reg, prefill) => {
    trackEvent('payment_started', { flow: 'solo', amount: reg?.price, categories: [reg?.category] });
    const outcome = await pay({
      registrationId: reg.id,
      dueAt: reg.payment_due_at,
      prefill,
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
  }, [pay, handlePaid]);

  const recheckPayment = useCallback(async () => {
    const outcome = await recheck();
    if (outcome?.outcome === 'paid') handlePaid(outcome.result);
  }, [recheck, handlePaid]);

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
  }, [cancelPayment, registration?.id, handlePaid, resetPayment]);

  // Anything typed or ticked -- the draft restore can bring back someone
  // else's details on a shared computer, which is when this matters most.
  // A code the form applied by itself is not something the runner entered.
  const formHasData = Object.keys(EMPTY_FORM).some(k => (
    k === 'couponCode'
      ? couponTouched && formData.couponCode !== ''
      : formData[k] !== EMPTY_FORM[k]
  )) || Object.values(waivers).some(Boolean);

  const clearForm = () => {
    if (!window.confirm('Clear everything you have entered and start a new registration?')) return;
    // Untouched again, so the offer is put back for the next runner.
    setCouponTouched(false);
    setFormData({ ...EMPTY_FORM, couponCode: autoCode });
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

        {/* The offer, said once at the top. Applied: what it is and that there
            is nothing to type. Not applied (the runner cleared the field or
            typed a code that does nothing): one tap puts it back. */}
        {step < 4 && autoOffer && (
          showingAuto ? (
            <p className="reg-offer" role="status">
              <Tag size={16} aria-hidden="true" />
              <span>
                <strong>
                  {autoOffer.summary.label} on {autoOffer.summary.appliesToAll ? 'all categories' : 'selected categories'}.
                </strong>{' '}
                Code <span className="reg-offer-code">{autoCode}</span> {couponTouched ? 'is applied.' : 'applied automatically.'}
              </span>
            </p>
          ) : (!currentCode || (quotesReady && !activeSummary)) && (
            <p className="reg-offer reg-offer--idle">
              <Tag size={16} aria-hidden="true" />
              <span>
                Code <span className="reg-offer-code">{autoCode}</span> gives {autoOffer.summary.label.toLowerCase()}
                {autoOffer.summary.appliesToAll ? ' on all categories' : ' on selected categories'}.
              </span>
              <button type="button" className="reg-offer-apply" onClick={applyOffer}>Apply</button>
            </p>
          )
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
              quotes={activeQuotes}
              couponStatus={couponStatus}
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
