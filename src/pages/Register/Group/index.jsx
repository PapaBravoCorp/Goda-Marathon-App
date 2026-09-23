import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Loader } from 'lucide-react';

import { CATEGORY_PRICING, CURRENT_EVENT, CATEGORY_RULES } from '../../../utils/constants';
import { createGroupRegistration } from '../../../utils/services/groupRegistrations';
import { previewCoupon } from '../../../utils/services/coupons';
import { getEventCategories } from '../../../utils/services/categories';
import { getCurrentEvent } from '../../../utils/services/events';
import { isValidPhone, isValidEmail, isValidPincode, calculateAge } from '../../../utils/validation';
import { trackEvent } from '../../../utils/analytics';

import Seo from '../../../components/Seo';

import StepCoordinator from './StepCoordinator';
import StepParticipants from './StepParticipants';
import StepGroupConfirm from './StepGroupConfirm';
import GroupSuccess from './GroupSuccess';
import { MIN_PARTICIPANTS, MAX_PARTICIPANTS, formatCurrency } from './groupHelpers';
import '../Register.css';
import './Group.css';

const DRAFT_KEY = 'goda-group-registration-draft';

const STEPS = [
  { num: 1, label: 'Coordinator' },
  { num: 2, label: 'Participants' },
  { num: 3, label: 'Confirm' },
];

const EMPTY_CAPTAIN = {
  firstName: '', lastName: '', email: '', phone: '',
  organisationName: '',
  city: '', state: '', pincode: '',
  emergencyContactName: '', emergencyContactNumber: '',
};

/**
 * A stable key per row, so React does not reuse a deleted participant's DOM
 * (and their typed values) for the person who took their place in the array.
 */
let rowSeq = 0;
const newParticipant = () => ({
  _key: `p${Date.now()}-${rowSeq++}`,
  firstName: '', lastName: '', email: '', phone: '',
  dob: '', gender: '', bloodGroup: '',
  category: '', tshirtSize: '',
  emergencyContactName: '', emergencyContactNumber: '',
  hasMedicalCondition: false, allergies: '', estimatedTime: '',
});

/**
 * Bulk registration.
 *
 * Kept as a separate route rather than a mode of the solo form. The two flows
 * ask for genuinely different things -- one runner's full medical and address
 * details versus a coordinator's contact plus a roster -- and folding them
 * together would have meant every field on the solo form growing a "which mode
 * are we in" branch.
 *
 * The pricing here is advisory. Every total shown comes from the database
 * (preview_coupon prices the basket from event_categories), and the figure
 * actually stored is computed again at insert time by the same function, so
 * what the coordinator is quoted and what they are billed cannot drift apart.
 */
export default function GroupRegister() {
  const [step, setStep] = useState(1);
  const [captain, setCaptain] = useState(EMPTY_CAPTAIN);
  const [participants, setParticipants] = useState(() => [newParticipant(), newParticipant()]);
  const [couponCode, setCouponCode] = useState('');
  const [waiversAccepted, setWaiversAccepted] = useState(false);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [notice, setNotice] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [dbCategories, setDbCategories] = useState([]);
  const [eventConfig, setEventConfig] = useState(null);
  const [result, setResult] = useState(null);

  const [quote, setQuote] = useState(null);
  const [isQuoting, setIsQuoting] = useState(false);

  const formRef = useRef(null);

  /* ── Load event + categories, restore any draft ───────────────────────── */

  useEffect(() => {
    let cancelled = false;

    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.captain) setCaptain(prev => ({ ...prev, ...d.captain }));
        if (Array.isArray(d.participants) && d.participants.length > 0) {
          // Re-key on restore: the saved keys came from a previous page load
          // and can collide with freshly generated ones.
          setParticipants(d.participants.map(p => ({ ...newParticipant(), ...p, _key: newParticipant()._key })));
        }
        if (d.couponCode) setCouponCode(d.couponCode);
        if (d.step && d.step < 4) setStep(d.step);
      } catch (err) {
        console.error('Failed to parse group registration draft', err);
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

    trackEvent('group_registration_started', { eventName: CURRENT_EVENT.name });
    return () => { cancelled = true; };
  }, []);

  // Persist the draft, never the completed state. A twenty-person roster is a
  // long sitting and a closed tab should not cost all of it.
  useEffect(() => {
    if (isLoaded && step < 4) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        step, captain, participants, couponCode,
      }));
    }
  }, [isLoaded, step, captain, participants, couponCode]);

  /* ── Categories, normalised ───────────────────────────────────────────── */

  const categories = useMemo(() => {
    if (dbCategories.length > 0) {
      return dbCategories.map(c => {
        const slotsLeft = c.slots_left ?? (
          c.max_slots == null ? null : Math.max(c.max_slots - (c.registration_count || 0), 0)
        );
        return {
          id: c.id,
          name: c.name,
          price: Number(c.price) || 0,
          minAge: c.min_age || 5,
          distance: c.distance,
          slotsLeft,
          status: slotsLeft === 0 ? 'Sold Out' : (c.status || 'Open'),
        };
      });
    }
    return Object.keys(CATEGORY_PRICING).map(name => ({
      id: name,
      name,
      price: CATEGORY_PRICING[name],
      minAge: CATEGORY_RULES[name]?.minAge || 5,
      distance: null,
      slotsLeft: null,
      status: 'Open',
    }));
  }, [dbCategories]);

  const categoryByName = useMemo(
    () => new Map(categories.map(c => [c.name, c])),
    [categories]
  );

  /** One category name per participant — the basket the coupon is priced on. */
  const basket = useMemo(
    () => participants.map(p => p.category).filter(Boolean),
    [participants]
  );

  const subtotal = useMemo(
    () => basket.reduce((sum, name) => sum + (categoryByName.get(name)?.price || 0), 0),
    [basket, categoryByName]
  );

  /**
   * How many of each category this group is asking for, so the roster can warn
   * about a category that cannot hold them all before the database refuses the
   * whole submission.
   */
  const perCategoryDemand = useMemo(() => {
    const counts = new Map();
    basket.forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
    return counts;
  }, [basket]);

  /* ── Coupon quote ─────────────────────────────────────────────────────── */

  /**
   * Priced by the database, not here.
   *
   * Re-runs when the basket changes as well as when the code does: a coupon
   * with a minimum group size or a category restriction is worth a different
   * amount after a participant is added or switched to another distance, and a
   * stale figure on the confirm screen is a figure the coordinator will hold
   * the organisers to.
   */
  useEffect(() => {
    if (step !== 3) return;

    const code = couponCode.trim();
    if (!code || basket.length === 0) { setQuote(null); return; }

    let cancelled = false;
    setIsQuoting(true);

    // Debounced: the field is typed into character by character, and each
    // keystroke would otherwise be a round trip.
    const timer = setTimeout(async () => {
      const q = await previewCoupon(code, eventConfig?.id || CURRENT_EVENT.slug, basket, true);
      if (cancelled) return;
      setQuote(q);
      setIsQuoting(false);
      if (q?.valid) {
        trackEvent('group_coupon_applied', { code, discount: q.discount });
      }
    }, 450);

    return () => { cancelled = true; clearTimeout(timer); setIsQuoting(false); };
  }, [couponCode, basket, step, eventConfig]);

  const discount = quote?.valid ? Number(quote.discount) || 0 : 0;
  const total = Math.max(subtotal - discount, 0);

  /* ── Field helpers ────────────────────────────────────────────────────── */

  const clearError = useCallback((key) => {
    setErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleCaptainChange = useCallback((e) => {
    const { name, value } = e.target;
    setCaptain(prev => ({ ...prev, [name]: value }));
    clearError(name);
    setNotice('');
  }, [clearError]);

  const handleParticipantChange = useCallback((index, field, value) => {
    setParticipants(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    clearError(`p${index}.${field}`);
    setSubmitError('');
  }, [clearError]);

  const addParticipant = useCallback(() => {
    setParticipants(prev => {
      if (prev.length >= MAX_PARTICIPANTS) return prev;
      return [...prev, newParticipant()];
    });
  }, []);

  /**
   * Copy the row above.
   *
   * A family or a club squad differs by name and date of birth and nothing
   * else; retyping the same category, t-shirt size and emergency contact
   * twenty times is the single biggest reason a coordinator abandons this form.
   * Identity fields are deliberately left blank -- duplicating an email would
   * only be rejected on submit.
   */
  const duplicateParticipant = useCallback((index) => {
    setParticipants(prev => {
      if (prev.length >= MAX_PARTICIPANTS) return prev;
      const src = prev[index];
      const copy = {
        ...newParticipant(),
        category: src.category,
        tshirtSize: src.tshirtSize,
        bloodGroup: '',
        emergencyContactName: src.emergencyContactName,
        emergencyContactNumber: src.emergencyContactNumber,
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }, []);

  const removeParticipant = useCallback((index) => {
    setParticipants(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
    // Row indices shift when one is removed, so any error keyed by index is now
    // pointing at the wrong person. Clearing them is better than mislabelling.
    setErrors({});
  }, []);

  const focusFirstError = useCallback((fieldErrors) => {
    const firstKey = Object.keys(fieldErrors)[0];
    if (!firstKey) return;
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector(`[data-field="${CSS.escape(firstKey)}"]`)
        || formRef.current?.querySelector(`[name="${firstKey}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus({ preventScroll: true });
      } else {
        formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });
  }, []);

  /* ── Step 1: coordinator ──────────────────────────────────────────────── */

  const submitCoordinator = (e) => {
    e.preventDefault();
    const next = {};

    if (!captain.firstName.trim()) next.firstName = 'Enter your first name.';
    if (!captain.lastName.trim()) next.lastName = 'Enter your last name.';

    if (!captain.email.trim()) next.email = 'Enter your email address.';
    else if (!isValidEmail(captain.email.trim())) next.email = 'That email address does not look valid.';

    if (!captain.phone.trim()) next.phone = 'Enter your phone number.';
    else if (!isValidPhone(captain.phone.trim())) next.phone = 'Enter a 10-digit Indian mobile number.';

    if (!captain.organisationName.trim()) {
      next.organisationName = 'Enter the club, company or group name.';
    }

    if (!captain.state) next.state = 'Select your state.';
    if (!captain.city.trim()) next.city = 'Enter your city.';

    if (!captain.pincode.trim()) next.pincode = 'Enter your pincode.';
    else if (!isValidPincode(captain.pincode.trim())) next.pincode = 'Enter a valid 6-digit pincode.';

    if (!captain.emergencyContactName.trim()) {
      next.emergencyContactName = 'Enter a fallback emergency contact for the group.';
    }
    if (!captain.emergencyContactNumber.trim()) {
      next.emergencyContactNumber = 'Enter a fallback emergency contact number.';
    } else if (!isValidPhone(captain.emergencyContactNumber.trim())) {
      next.emergencyContactNumber = 'Enter a 10-digit Indian mobile number.';
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      focusFirstError(next);
      trackEvent('group_validation_failed', { step: 1, fields: Object.keys(next) });
      return;
    }

    setErrors({});
    trackEvent('group_step_completed', { step: 1 });
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Step 2: participants ─────────────────────────────────────────────── */

  const submitParticipants = (e) => {
    e.preventDefault();
    const next = {};

    if (participants.length < MIN_PARTICIPANTS) {
      next.roster = `Add at least ${MIN_PARTICIPANTS} participants, or use the individual form for a single runner.`;
    }
    if (participants.length > MAX_PARTICIPANTS) {
      next.roster = `A single group entry is limited to ${MAX_PARTICIPANTS} participants.`;
    }

    // Case-insensitive, matching the unique index the database enforces.
    const seen = new Map();

    participants.forEach((p, i) => {
      const at = (field, message) => { next[`p${i}.${field}`] = message; };

      if (!p.firstName.trim()) at('firstName', 'Enter a first name.');
      if (!p.lastName.trim()) at('lastName', 'Enter a last name.');

      const email = p.email.trim().toLowerCase();
      if (!email) at('email', 'Enter an email address.');
      else if (!isValidEmail(email)) at('email', 'That email address does not look valid.');
      else if (seen.has(email)) at('email', `Already used by participant ${seen.get(email) + 1}.`);
      else seen.set(email, i);

      if (!p.phone.trim()) at('phone', 'Enter a phone number.');
      else if (!isValidPhone(p.phone.trim())) at('phone', 'Enter a 10-digit Indian mobile number.');

      const age = calculateAge(p.dob);
      if (!p.dob) {
        at('dob', 'Enter a date of birth.');
      } else if (age === null || Number.isNaN(age) || age < 0 || age > 120) {
        at('dob', 'That date does not look right.');
      }

      if (!p.gender) at('gender', 'Select an option.');
      if (!p.bloodGroup) at('bloodGroup', 'Select a blood group.');
      if (!p.tshirtSize) at('tshirtSize', 'Pick a size.');

      if (!p.category) {
        at('category', 'Choose a category.');
      } else {
        const cat = categoryByName.get(p.category);
        if (!cat) {
          at('category', 'That category is no longer available.');
        } else if (cat.status !== 'Open') {
          at('category', `${cat.name} is ${cat.status.toLowerCase()}.`);
        } else if (age !== null && !Number.isNaN(age) && age < cat.minAge) {
          at('category', `${cat.name} is for runners aged ${cat.minAge} and over.`);
        }
      }

      // Optional, but a number that was typed has to be a real one.
      if (p.emergencyContactNumber.trim() && !isValidPhone(p.emergencyContactNumber.trim())) {
        at('emergencyContactNumber', 'Enter a 10-digit Indian mobile number.');
      }
      if (p.hasMedicalCondition && !p.allergies.trim()) {
        at('allergies', 'Describe the condition so the medical team knows.');
      }
      if (p.estimatedTime.trim() && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(p.estimatedTime.trim())) {
        at('estimatedTime', 'Use HH:MM or HH:MM:SS, or leave it blank.');
      }
    });

    // Capacity, checked against what this group is asking for rather than
    // "is there one place left". The database refuses the whole submission
    // otherwise, and finding that out after the roster is typed is worse.
    perCategoryDemand.forEach((wanted, name) => {
      const cat = categoryByName.get(name);
      if (cat?.slotsLeft != null && wanted > cat.slotsLeft) {
        next.roster = `${name} has ${cat.slotsLeft} place${cat.slotsLeft === 1 ? '' : 's'} left, but you have ${wanted} runner${wanted === 1 ? '' : 's'} in it.`;
      }
    });

    if (Object.keys(next).length > 0) {
      setErrors(next);
      focusFirstError(next);
      trackEvent('group_validation_failed', { step: 2, count: participants.length });
      return;
    }

    setErrors({});
    trackEvent('group_step_completed', { step: 2, participants: participants.length });
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Step 3: confirm ──────────────────────────────────────────────────── */

  const submitGroup = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!waiversAccepted || !authorityConfirmed) {
      const next = { waivers: 'Please accept both declarations to continue.' };
      setErrors(next);
      requestAnimationFrame(() => {
        formRef.current?.querySelector('.reg-declarations')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      // No prices and no discount are sent. The database re-prices the basket
      // and re-evaluates the code; the figures above are a quote, not an input.
      const saved = await createGroupRegistration({
        eventId: eventConfig?.id || CURRENT_EVENT.slug,
        captain: {
          ...captain,
          firstName: captain.firstName.trim(),
          lastName: captain.lastName.trim(),
          email: captain.email.trim(),
          phone: captain.phone.trim(),
          organisationName: captain.organisationName.trim(),
          city: captain.city.trim(),
          pincode: captain.pincode.trim(),
          emergencyContactName: captain.emergencyContactName.trim(),
          emergencyContactNumber: captain.emergencyContactNumber.trim(),
        },
        participants: participants.map(p => ({
          ...p,
          firstName: p.firstName.trim(),
          lastName: p.lastName.trim(),
          email: p.email.trim(),
          phone: p.phone.trim(),
          emergencyContactName: p.emergencyContactName.trim(),
          emergencyContactNumber: p.emergencyContactNumber.trim(),
        })),
        couponCode: couponCode.trim() || null,
        waiversAccepted: true,
      });

      setResult(saved);
      localStorage.removeItem(DRAFT_KEY);
      trackEvent('group_registration_completed', {
        participants: saved?.participant_count,
        total: saved?.total,
        coupon: saved?.coupon_code || null,
      });
      setStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(err.message);

      // Send the coordinator back to the row that needs fixing, with the error
      // already attached to the field. Leaving them on the confirm screen means
      // staring at a submit button that cannot succeed.
      if (err.participantIndex != null) {
        const key = `p${err.participantIndex}.${
          err.code === 'UNDER_MIN_AGE' || err.code?.startsWith('CATEGORY') ? 'category'
            : err.code === 'DOB_REQUIRED' || err.code === 'DOB_INVALID' ? 'dob'
            : 'email'
        }`;
        const next = { [key]: err.fieldMessage || err.message };
        setErrors(next);
        setStep(2);
        setNotice(err.message);
        focusFirstError(next);
      } else if (err.code === 'CATEGORY_FULL') {
        setStep(2);
        setNotice(err.message);
        const ev = await getCurrentEvent();
        if (ev?.id) setDbCategories(await getEventCategories(ev.id, ev.id));
      }

      trackEvent('group_registration_failed', { reason: err.code });
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
        <p>Loading group registration…</p>
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
        title="Group Registration"
        description={`Enter a club, company or school team into the ${eventConfig?.name || CURRENT_EVENT.name} in one go, with group discounts.`}
      />
      <div className="reg-container grp-container">
        {step < 4 && (
          <ol className="reg-steps" aria-label="Group registration progress">
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
            <StepCoordinator
              captain={captain}
              errors={errors}
              onChange={handleCaptainChange}
              onNext={submitCoordinator}
            />
          )}

          {step === 2 && (
            <StepParticipants
              participants={participants}
              errors={errors}
              categories={categories}
              categoryByName={categoryByName}
              perCategoryDemand={perCategoryDemand}
              subtotal={subtotal}
              captain={captain}
              onChange={handleParticipantChange}
              onAdd={addParticipant}
              onDuplicate={duplicateParticipant}
              onRemove={removeParticipant}
              onBack={() => goBack(1)}
              onNext={submitParticipants}
              formatCurrency={formatCurrency}
            />
          )}

          {step === 3 && (
            <StepGroupConfirm
              captain={captain}
              participants={participants}
              categoryByName={categoryByName}
              couponCode={couponCode}
              onCouponChange={setCouponCode}
              quote={quote}
              isQuoting={isQuoting}
              subtotal={subtotal}
              discount={discount}
              total={total}
              waiversAccepted={waiversAccepted}
              authorityConfirmed={authorityConfirmed}
              onWaiversChange={setWaiversAccepted}
              onAuthorityChange={setAuthorityConfirmed}
              errors={errors}
              onBack={() => goBack(2)}
              onSubmit={submitGroup}
              isSubmitting={isSubmitting}
              submitError={submitError}
              formatCurrency={formatCurrency}
            />
          )}

          {step === 4 && (
            <GroupSuccess
              result={result}
              eventName={eventConfig?.name || CURRENT_EVENT.name}
              contactEmail={eventConfig?.contact_email}
              contactPhone={eventConfig?.contact_phone}
              formatCurrency={formatCurrency}
            />
          )}
        </div>
      </div>
    </div>
  );
}
