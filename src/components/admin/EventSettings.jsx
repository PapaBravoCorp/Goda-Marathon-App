import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, CheckCircle, Eye } from 'lucide-react';
import { getCurrentEvent, updateEvent } from '../../utils/services/events';
import { getEventCategories } from '../../utils/services/categories';
import { uploadHeroVariants, uploadMedia, deleteStoredImageAt } from '../../utils/services/storage';
import { getSiteSettings, updateSiteSettings } from '../../utils/services/siteSettings';
import { SITE_THEME_OPTIONS } from '../../utils/theme';
import { useTheme } from '../../utils/themeContext';
import { describeSaveError } from '../../utils/services/errors';
import { formatHeroDate, buildCountdownTarget } from '../../utils/dates';
import { DEFAULT_HERO_HEADLINE } from '../HeroHeadline';
import HeroImageField from './HeroImageField';
import HeroPreview from './HeroPreview';
import HeroVideoField from './HeroVideoField';
import EmailPreviewModal from './EmailPreviewModal';
import EventFeaturesField from './EventFeaturesField';
import { cleanEventFeatures } from '../../utils/eventFeatures';

export default function EventSettings() {
  const [eventData, setEventData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  // The hero URL the row holds right now, and a resized photo waiting for Save.
  const [savedHero, setSavedHero] = useState(null);
  const [pendingHero, setPendingHero] = useState(null);
  const [categoryCount, setCategoryCount] = useState(0);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  // The hero video the row holds now, and a chosen file waiting for Save.
  const [savedVideo, setSavedVideo] = useState(null);
  const [pendingVideo, setPendingVideo] = useState(null);
  // Site-wide default theme (site_settings, migration 0018). Null until
  // loaded, and stays null before the migration runs, which hides the field.
  const [siteTheme, setSiteTheme] = useState(null);
  const [savedSiteTheme, setSavedSiteTheme] = useState(null);
  const { setSiteDefault } = useTheme();

  useEffect(() => { loadEvent(); }, []);

  useEffect(() => {
    let cancelled = false;
    getSiteSettings({ fresh: true }).then(row => {
      if (cancelled || !row) return;
      setSiteTheme(row.default_theme);
      setSavedSiteTheme(row.default_theme);
    });
    return () => { cancelled = true; };
  }, []);

  // Free the preview's in-memory copy once it is replaced, discarded or saved.
  useEffect(() => () => {
    if (pendingHero) URL.revokeObjectURL(pendingHero.previewUrl);
  }, [pendingHero]);

  const loadEvent = async () => {
    setIsLoading(true);
    const data = await getCurrentEvent();
    setEventData(data);
    setSavedHero(data?.hero_image ?? null);
    setSavedVideo(data?.hero_video ?? null);
    setIsLoading(false);
    if (data?.id) {
      const categories = await getEventCategories(data.id, data.id);
      setCategoryCount(categories.length);
    }
  };

  const setHeroImage = (url) => {
    setEventData(prev => ({ ...prev, hero_image: url }));
    setSaveMsg('');
  };

  const setPendingHeroPhoto = (pending) => {
    setPendingHero(pending);
    setSaveMsg('');
  };

  const handleInput = (e) => {
    const { name, value, type, checked } = e.target;
    setEventData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setSaveMsg('');
  };

  // The payment columns arrive with migration 0011. Until then they are
  // neither shown nor saved, so this panel keeps working on a database that
  // has not been migrated yet.
  const hasPaymentSettings = !!eventData && 'online_payment_enabled' in eventData;
  // Likewise the email settings, which arrive with migration 0014.
  const hasEmailSettings = !!eventData && 'confirmation_emails_enabled' in eventData;
  const hasFeatures = !!eventData && 'features' in eventData;
  // And the hero video, which arrives with migration 0018.
  const hasHeroVideo = !!eventData && 'hero_video' in eventData;

  const setHeroVideo = (url) => {
    setEventData(prev => ({ ...prev, hero_video: url }));
    setSaveMsg('');
  };

  const setPendingHeroVideo = (file) => {
    setPendingVideo(file);
    setSaveMsg('');
  };

  const setFeatures = (features) => {
    setEventData(prev => ({ ...prev, features }));
    setSaveMsg('');
  };

  const handleSave = async () => {
    if (!eventData) return;
    const cleanedFeatures = hasFeatures ? cleanEventFeatures(eventData.features) : null;
    if (cleanedFeatures?.error) { setSaveMsg(cleanedFeatures.error); return; }
    setIsSaving(true);
    setSaveMsg('');
    let uploadedHero = null;
    let uploadedVideo = null;
    let rowSaved = false;
    try {
      let heroImage = eventData.hero_image;
      if (pendingHero) {
        uploadedHero = await uploadHeroVariants(pendingHero.resized, pendingHero.fileName);
        heroImage = uploadedHero;
      }
      let heroVideo = hasHeroVideo ? (eventData.hero_video || null) : null;
      if (hasHeroVideo && pendingVideo) {
        uploadedVideo = (await uploadMedia(pendingVideo, 'hero/video')).publicUrl;
        heroVideo = uploadedVideo;
      }

      const hold = parseInt(eventData.payment_hold_minutes, 10);
      await updateEvent(eventData.id, {
        ...(hasPaymentSettings ? {
          online_payment_enabled: !!eventData.online_payment_enabled,
          // The database enforces 10-180; clamping here turns a typo into a
          // sensible value instead of a failed save.
          payment_hold_minutes: Number.isFinite(hold) ? Math.min(Math.max(hold, 10), 180) : 30,
        } : {}),
        ...(hasEmailSettings ? {
          confirmation_emails_enabled: !!eventData.confirmation_emails_enabled,
          confirmation_email_note: eventData.confirmation_email_note?.trim() || null,
        } : {}),
        ...(hasFeatures ? { features: cleanedFeatures.features } : {}),
        ...(hasHeroVideo ? { hero_video: heroVideo } : {}),
        name: eventData.name,
        date: eventData.date,
        location: eventData.location,
        venue: eventData.venue,
        description: eventData.description,
        flag_off_time: eventData.flag_off_time,
        registration_open: eventData.registration_open,
        edition: eventData.edition,
        hero_image: heroImage,
        hero_headline: eventData.hero_headline || null,
        hero_subcopy: eventData.hero_subcopy || null,
        last_registration_date: eventData.last_registration_date || null,
        total_slots: eventData.total_slots ? parseInt(eventData.total_slots) : null,
        contact_email: eventData.contact_email || null,
        contact_phone: eventData.contact_phone || null,
      });

      rowSaved = true;

      // The row no longer points at the old photo; remove it if we host it.
      if (savedHero && savedHero !== heroImage) deleteStoredImageAt(savedHero);
      setSavedHero(heroImage);
      if (hasHeroVideo) {
        if (savedVideo && savedVideo !== heroVideo) deleteStoredImageAt(savedVideo);
        setSavedVideo(heroVideo);
        setPendingVideo(null);
      }
      setEventData(prev => ({
        ...prev,
        hero_image: heroImage,
        ...(hasHeroVideo ? { hero_video: heroVideo } : {}),
        ...(hasFeatures ? { features: cleanedFeatures.features } : {}),
      }));
      setPendingHero(null);

      // Saved separately: it lives in site_settings, not on the event row.
      if (siteTheme && siteTheme !== savedSiteTheme) {
        await updateSiteSettings({ default_theme: siteTheme });
        setSavedSiteTheme(siteTheme);
        setSiteDefault(siteTheme);
      }
      setSaveMsg('Event settings saved successfully!');
    } catch (err) {
      // If the event row did not save, it still points at the old files, so
      // the new uploads are orphans. If it did (and only the theme failed),
      // they are in use and must stay.
      if (!rowSaved) {
        if (uploadedHero) deleteStoredImageAt(uploadedHero);
        if (uploadedVideo) deleteStoredImageAt(uploadedVideo);
      }
      setSaveMsg(describeSaveError(err, 'event settings'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="admin-empty-state">Loading event settings...</div>;
  if (!eventData) return (
    <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
      <p>No event found in the database. Please seed the events table first.</p>
    </div>
  );

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Event Settings</h3>
        <button className="btn btn-primary admin-action-btn" onClick={handleSave} disabled={isSaving} style={{ gap: '6px' }}>
          {isSaving ? <RefreshCw size={18} className="spin" /> : <Save size={18} />}
          <span className="admin-action-label">
            {isSaving
              ? (pendingVideo ? 'Uploading video...' : pendingHero ? 'Uploading photo...' : 'Saving...')
              : 'Save Changes'}
          </span>
        </button>
      </div>

      {saveMsg && (
        <div className={`admin-save-msg ${saveMsg.includes('success') ? 'success' : 'error'}`}>
          <CheckCircle size={16} /> {saveMsg}
        </div>
      )}

      <div className="admin-event-form glass">
        {/* Basic Info */}
        <h4 className="admin-form-section-title">Basic Information</h4>
        <div className="admin-media-form-grid">
          <div className="admin-media-form-group">
            <label htmlFor="evt-name">Event Name</label>
            <input id="evt-name" name="name" value={eventData.name || ''} onChange={handleInput} />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-edition">Edition</label>
            <input id="evt-edition" name="edition" value={eventData.edition || ''} onChange={handleInput} placeholder="e.g. 3rd" />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-date">Event Date</label>
            <input id="evt-date" name="date" type="date" value={eventData.date || ''} onChange={handleInput} />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-flagoff">Flag-Off Time</label>
            <input id="evt-flagoff" name="flag_off_time" value={eventData.flag_off_time || ''} onChange={handleInput} placeholder="e.g. 06:45 AM" />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-location">Location</label>
            <input id="evt-location" name="location" value={eventData.location || ''} onChange={handleInput} />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-venue">Venue</label>
            <input id="evt-venue" name="venue" value={eventData.venue || ''} onChange={handleInput} />
          </div>
        </div>

        <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="evt-desc">Description</label>
          <textarea id="evt-desc" name="description" value={eventData.description || ''} onChange={handleInput} rows={3} style={{ resize: 'vertical' }} />
        </div>

        {/* Homepage Hero */}
        <h4 className="admin-form-section-title" style={{ marginTop: '1.5rem' }}>Homepage Hero</h4>
        <HeroImageField
          value={eventData.hero_image}
          savedValue={savedHero}
          pending={pendingHero}
          onPending={setPendingHeroPhoto}
          onChange={setHeroImage}
          disabled={isSaving}
        />
        {hasHeroVideo && (
          <HeroVideoField
            value={eventData.hero_video}
            pending={pendingVideo}
            onPending={setPendingHeroVideo}
            onChange={setHeroVideo}
            disabled={isSaving}
          />
        )}
        <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="evt-hero-headline">Hero Headline</label>
          <input id="evt-hero-headline" name="hero_headline" value={eventData.hero_headline || ''} onChange={handleInput} placeholder="RUN BEYOND LIMITS" />
          <span className="admin-field-hint">Displayed uppercase on the homepage. The last word is highlighted automatically.</span>
        </div>
        <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="evt-hero-subcopy">Hero Sub-copy</label>
          <textarea id="evt-hero-subcopy" name="hero_subcopy" value={eventData.hero_subcopy || ''} onChange={handleInput} rows={3} style={{ resize: 'vertical' }} placeholder="Push past your limits at…" />
          <span className="admin-field-hint">Paragraph under the headline. Falls back to Description if left empty.</span>
        </div>

        <div className="admin-hero-preview">
          <span className="admin-image-field-label">Preview</span>
          <HeroPreview
            image={pendingHero?.previewUrl || eventData.hero_image}
            headline={eventData.hero_headline || DEFAULT_HERO_HEADLINE}
            subcopy={eventData.hero_subcopy || eventData.description}
            badge={eventData.edition ? `${eventData.edition} Edition` : 'Upcoming Event'}
            date={formatHeroDate(eventData.date)}
            countdownTarget={buildCountdownTarget(eventData.date, eventData.flag_off_time)}
            location={eventData.location}
            registrationOpen={eventData.registration_open}
            categoryCount={categoryCount}
          />
          <span className="admin-field-hint">
            Updates as you edit, before you save. Screens vary, so the crop on a real device can
            differ slightly; check the homepage after saving.
          </span>
        </div>

        {/* Appearance */}
        {siteTheme && (
          <>
            <h4 className="admin-form-section-title" style={{ marginTop: '1.5rem' }}>Appearance</h4>
            <div className="admin-media-form-group" style={{ maxWidth: '360px' }}>
              <label htmlFor="evt-default-theme">Default theme</label>
              <select
                id="evt-default-theme"
                value={siteTheme}
                onChange={(e) => { setSiteTheme(e.target.value); setSaveMsg(''); }}
              >
                {SITE_THEME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span className="admin-field-hint">
                What a visitor sees on their first visit. Anyone who flips the light/dark switch in
                the header keeps their own choice. Applies to the whole site, not just this edition.
                The admin panel itself is always dark.
              </span>
            </div>
          </>
        )}

        {/* Registration Config */}
        <h4 className="admin-form-section-title" style={{ marginTop: '1.5rem' }}>Registration Configuration</h4>
        <div className="admin-media-form-grid">
          <div className="admin-media-form-group">
            <label htmlFor="evt-lastreg">Last Registration Date</label>
            <input id="evt-lastreg" name="last_registration_date" type="date" value={eventData.last_registration_date || ''} onChange={handleInput} />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-slots">Total Slots</label>
            <input id="evt-slots" name="total_slots" type="number" value={eventData.total_slots || ''} onChange={handleInput} placeholder="e.g. 500" />
          </div>
        </div>
        <div className="admin-event-toggle" style={{ marginTop: '1rem' }}>
          <label className="admin-toggle-label">
            <input type="checkbox" name="registration_open" checked={eventData.registration_open || false} onChange={handleInput} className="admin-toggle-checkbox" />
            <span className="admin-toggle-switch"></span>
            <span>Registration {eventData.registration_open ? 'Open' : 'Closed'}</span>
          </label>
        </div>

        {/* Payments */}
        <h4 className="admin-form-section-title" style={{ marginTop: '1.5rem' }}>Payments</h4>
        {hasPaymentSettings ? (
          <>
            <div className="admin-event-toggle">
              <label className="admin-toggle-label">
                <input type="checkbox" name="online_payment_enabled" checked={eventData.online_payment_enabled || false} onChange={handleInput} className="admin-toggle-checkbox" />
                <span className="admin-toggle-switch"></span>
                <span>Online payment (Razorpay) {eventData.online_payment_enabled ? 'On' : 'Off'}</span>
              </label>
            </div>
            <span className="admin-field-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
              On: runners pay by Razorpay when they register, and their entry is confirmed automatically.
              An unpaid reservation is released after the hold time below. Off: entries are saved as
              payment pending and you collect payment yourselves. Switching off keeps any reservations
              already waiting as ordinary pending entries. Test a full payment before switching this on
              for the public.
            </span>
            <div className="admin-media-form-grid" style={{ marginTop: '0.75rem' }}>
              <div className="admin-media-form-group">
                <label htmlFor="evt-hold">Hold unpaid reservations for (minutes)</label>
                <input id="evt-hold" name="payment_hold_minutes" type="number" min={10} max={180} value={eventData.payment_hold_minutes ?? 30} onChange={handleInput} />
                <span className="admin-field-hint">10 to 180. 30 leaves time for a slow UPI approval.</span>
              </div>
            </div>
          </>
        ) : (
          <p className="admin-field-hint">
            Apply <code>supabase/migrations/0011_razorpay_payments.sql</code> to enable online payment.
          </p>
        )}

        {/* Registration emails */}
        <h4 className="admin-form-section-title" style={{ marginTop: '1.5rem' }}>Registration Emails</h4>
        {hasEmailSettings ? (
          <>
            <div className="admin-event-toggle">
              <label className="admin-toggle-label">
                <input type="checkbox" name="confirmation_emails_enabled" checked={eventData.confirmation_emails_enabled || false} onChange={handleInput} className="admin-toggle-checkbox" />
                <span className="admin-toggle-switch"></span>
                <span>Automatic emails {eventData.confirmation_emails_enabled ? 'On' : 'Off'}</span>
              </label>
            </div>
            <span className="admin-field-hint" style={{ display: 'block', marginTop: '0.5rem' }}>
              On: every runner is emailed their bib and entry details when their entry is confirmed (paid
              online, free with a coupon, or marked paid in Registrations), and group coordinators get a roster. With
              online payment off, whoever registered is also emailed straight away with the amount due.
              Track delivery under Email &rarr; Deliveries. Replies go to the contact email below.
            </span>
            <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
              <label htmlFor="evt-email-note">Race-day information</label>
              <textarea
                id="evt-email-note"
                name="confirmation_email_note"
                value={eventData.confirmation_email_note || ''}
                onChange={handleInput}
                rows={4}
                style={{ resize: 'vertical' }}
                // placeholder={'Kit collection: Decathlon Nashik, 11–12 Dec, 10 am – 7 pm\nReporting time: 5:45 am at the start arch\nBring: photo ID and this email'}
                placeholder={'To Be Announced'}
              />
              <span className="admin-field-hint">
                Printed in every confirmation email sent after you save. Leave empty until the details are final.
              </span>
            </div>
            <button type="button" className="btn btn-outline admin-action-btn" onClick={() => setShowEmailPreview(true)} style={{ gap: '6px', marginTop: '0.75rem' }}>
              <Eye size={16} /> Preview email
            </button>
          </>
        ) : (
          <p className="admin-field-hint">
            Apply <code>supabase/migrations/0014_registration_emails.sql</code> to enable registration emails.
          </p>
        )}

        {/* Contact Details */}
        <h4 className="admin-form-section-title" style={{ marginTop: '1.5rem' }}>Contact Details</h4>
        <div className="admin-media-form-grid">
          <div className="admin-media-form-group">
            <label htmlFor="evt-email">Contact Email</label>
            <input id="evt-email" name="contact_email" type="email" value={eventData.contact_email || ''} onChange={handleInput} placeholder="e.g. info@godatrailrun.com" />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-phone">Contact Phone</label>
            <input id="evt-phone" name="contact_phone" value={eventData.contact_phone || ''} onChange={handleInput} placeholder="e.g. +91 82085 92273" />
          </div>
        </div>

        {/* Event Details page: Features & Expo */}
        {hasFeatures && (
          <>
            <h4 className="admin-form-section-title" style={{ marginTop: '1.5rem' }}>Event Details Page: Features &amp; Expo</h4>
            <span className="admin-field-hint" style={{ marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
              Cards under "Event Features &amp; Expo" on the Event Details page, in this order. Line breaks in Details
              are kept. Highlight adds an orange edge and a map pin, for venue and timing details. Saved with Save Changes.
            </span>
            <EventFeaturesField value={eventData.features} onChange={setFeatures} disabled={isSaving} />
          </>
        )}
      </div>

      {showEmailPreview && (
        <EmailPreviewModal event={eventData} onClose={() => setShowEmailPreview(false)} />
      )}
    </div>
  );
}
