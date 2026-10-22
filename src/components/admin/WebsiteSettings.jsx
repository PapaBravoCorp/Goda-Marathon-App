import React, { useState, useEffect } from 'react';
import {
  Save, RefreshCw, CheckCircle, AlertTriangle, Plus, Trash2, ArrowUp, ArrowDown,
} from 'lucide-react';
import LogoField from './LogoField';
import GuestManager from './GuestManager';
import { getSiteSettings, updateSiteSettings } from '../../utils/services/siteSettings';
import { getCurrentEvent } from '../../utils/services/events';
import { getEventCategories } from '../../utils/services/categories';
import { uploadBrandingLogo, deleteStoredImageAt } from '../../utils/services/storage';
import { describeSaveError } from '../../utils/services/errors';
import { distanceLabels, describeDistanceRange, toKm } from '../../utils/distances';
import { ORGANISATION } from '../../utils/constants';
import {
  LOGO_PLATES, HERO_LOGO_PLACEMENTS, CTA_EFFECTS, DISTANCE_MODES, MAX_FOOTER_CONTACTS,
  DEFAULT_BRAND_NAME, DEFAULT_FOOTER_ABOUT, DEFAULT_GUESTS_HEADING, DEFAULT_GUESTS_INTRO,
  cleanFooterContacts,
} from '../../utils/siteBranding';

// The hero draws its logo up to ~640 x 260 CSS px; twice that is sharp on a
// high-density screen. The header logo keeps prepareLogo's smaller default.
const HERO_LOGO_BOX = { maxWidth: 1280, maxHeight: 640 };

const emptyContact = () => ({ name: '', role: '', phone: '', whatsapp: true });

/** The editable copy of a site_settings row: every field a string or boolean. */
function toForm(row) {
  return {
    brand_logo: row.brand_logo || '',
    brand_logo_plate: row.brand_logo_plate || 'light',
    brand_name: row.brand_name || '',
    brand_name_visible: row.brand_name_visible !== false,
    hero_logo: row.hero_logo || '',
    hero_logo_plate: row.hero_logo_plate || 'none',
    hero_logo_placement: row.hero_logo_placement || 'replace',
    hero_cta_effect: row.hero_cta_effect || 'pulse',
    hero_distances: row.hero_distances || 'list',
    hero_distances_text: row.hero_distances_text || '',
    event_heading: row.event_heading || '',
    footer_about: row.footer_about || '',
    footer_copyright: row.footer_copyright || '',
    footer_contacts: (Array.isArray(row.footer_contacts) ? row.footer_contacts : []).map(c => ({
      name: c?.name || '',
      role: c?.role || '',
      phone: c?.phone || '',
      whatsapp: c?.whatsapp !== false,
    })),
    guests_heading: row.guests_heading || '',
    guests_intro: row.guests_intro || '',
  };
}

const orNull = (value) => String(value ?? '').trim() || null;

/**
 * Admin -> Website: the look of the public site that used to need a code
 * change -- the logo, the homepage hero, the Event Details heading and the
 * footer -- plus the homepage's Guests of Honour.
 *
 * Everything except the guests is one site_settings row (0020), saved with
 * Save Changes. An empty field means "keep the site's default", so details
 * still being collected can be left blank and plugged in later. Guests are
 * rows of their own and save from their own form.
 */
export default function WebsiteSettings() {
  const [status, setStatus] = useState('loading'); // loading | ready | needs-migration | error
  const [row, setRow] = useState(null);
  const [form, setForm] = useState(null);
  const [event, setEvent] = useState(null);
  const [categories, setCategories] = useState([]);
  const [pendingBrand, setPendingBrand] = useState(null);
  const [pendingHero, setPendingHero] = useState(null);
  const [processing, setProcessing] = useState({ brand: false, hero: false });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null); // { tone: 'success' | 'error', text }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [settings, current] = await Promise.all([
        getSiteSettings({ fresh: true }),
        getCurrentEvent(),
      ]);
      if (cancelled) return;
      setEvent(current);
      if (current?.id) {
        getEventCategories(current.id, current.id).then(cats => { if (!cancelled) setCategories(cats); });
      }
      if (!settings) { setStatus('error'); return; }
      // The columns arrive with 0020; until then there is nothing to edit.
      if (!('brand_logo' in settings)) { setStatus('needs-migration'); return; }
      setRow(settings);
      setForm(toForm(settings));
      setStatus('ready');
    })();
    return () => { cancelled = true; };
  }, []);

  // Free a preview's in-memory copy once it is replaced, discarded or saved.
  useEffect(() => () => { if (pendingBrand) URL.revokeObjectURL(pendingBrand.previewUrl); }, [pendingBrand]);
  useEffect(() => () => { if (pendingHero) URL.revokeObjectURL(pendingHero.previewUrl); }, [pendingHero]);

  if (status === 'loading') return <div className="admin-empty-state">Loading website settings…</div>;

  if (status !== 'ready') {
    return (
      <div className="admin-drive-warning">
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          {status === 'needs-migration' ? (
            <>
              The database is not ready for these settings yet. Run{' '}
              <code>supabase/migrations/0020_website_settings.sql</code> in the Supabase SQL editor,
              then reload this page.
            </>
          ) : (
            <>
              Could not load the website settings. Check your connection and reload. If it keeps
              happening, run <code>0018_theme_and_hero_video.sql</code> and then{' '}
              <code>0020_website_settings.sql</code> in the Supabase SQL editor.
            </>
          )}
        </span>
      </div>
    );
  }

  const set = (name, value) => {
    setForm(prev => ({ ...prev, [name]: value }));
    setMessage(null);
  };

  const onInput = (e) => {
    const { name, value, type, checked } = e.target;
    set(name, type === 'checkbox' ? checked : value);
  };

  const contacts = form.footer_contacts;
  const setContact = (index, field, value) =>
    set('footer_contacts', contacts.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  const addContact = () => set('footer_contacts', [...contacts, emptyContact()]);
  const removeContact = (index) => set('footer_contacts', contacts.filter((_, i) => i !== index));
  const moveContact = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= contacts.length) return;
    const next = [...contacts];
    [next[index], next[target]] = [next[target], next[index]];
    set('footer_contacts', next);
  };

  const isProcessing = processing.brand || processing.hero;
  const isDirty = !!pendingBrand || !!pendingHero || JSON.stringify(form) !== JSON.stringify(toForm(row));

  const handleSave = async () => {
    if (isSaving || isProcessing) return;
    const cleaned = cleanFooterContacts(form.footer_contacts);
    if (cleaned.error) { setMessage({ tone: 'error', text: cleaned.error }); return; }
    if (form.hero_distances === 'custom' && !form.hero_distances_text.trim()) {
      setMessage({ tone: 'error', text: 'Type the text for the Distances box, or pick another option for it.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    const uploaded = [];
    let saved = false;
    try {
      let brandLogo = form.brand_logo || null;
      if (pendingBrand) {
        brandLogo = await uploadBrandingLogo(pendingBrand.logo, pendingBrand.fileName);
        uploaded.push(brandLogo);
      }
      let heroLogo = form.hero_logo || null;
      if (pendingHero) {
        heroLogo = await uploadBrandingLogo(pendingHero.logo, pendingHero.fileName);
        uploaded.push(heroLogo);
      }

      const next = await updateSiteSettings({
        brand_logo: brandLogo,
        brand_logo_plate: form.brand_logo_plate,
        brand_name: orNull(form.brand_name),
        brand_name_visible: !!form.brand_name_visible,
        hero_logo: heroLogo,
        hero_logo_plate: form.hero_logo_plate,
        hero_logo_placement: form.hero_logo_placement,
        hero_cta_effect: form.hero_cta_effect,
        hero_distances: form.hero_distances,
        hero_distances_text: orNull(form.hero_distances_text),
        event_heading: orNull(form.event_heading),
        footer_about: orNull(form.footer_about),
        footer_copyright: orNull(form.footer_copyright),
        footer_contacts: cleaned.contacts,
        guests_heading: orNull(form.guests_heading),
        guests_intro: orNull(form.guests_intro),
      });
      saved = true;

      // The row no longer points at a replaced logo; remove it if we host it.
      const inUse = [next.brand_logo, next.hero_logo];
      for (const old of [row.brand_logo, row.hero_logo]) {
        if (old && !inUse.includes(old)) deleteStoredImageAt(old);
      }

      setRow(next);
      setForm(toForm(next));
      setPendingBrand(null);
      setPendingHero(null);
      setMessage({ tone: 'success', text: 'Website settings saved. They are live on the site now.' });
    } catch (err) {
      // Not saved: the row still points at the old files, so the new uploads are orphans.
      if (!saved) uploaded.forEach(url => deleteStoredImageAt(url));
      setMessage({ tone: 'error', text: describeSaveError(err, 'website settings') });
    } finally {
      setIsSaving(false);
    }
  };

  // What the hero's Distances box will say, from the categories as they are now.
  const labels = distanceLabels(categories);
  const range = describeDistanceRange(categories.map(c => toKm(c.distance)).filter(n => n > 0));
  const distancesPreview = {
    list: labels.join(' · '),
    range,
    custom: form.hero_distances_text.trim(),
  }[form.hero_distances];

  const hasHeroLogo = !!(pendingHero || form.hero_logo);

  return (
    <div>
      <div className="admin-media-header">
        <div>
          <h3 style={{ margin: 0 }}>Website</h3>
          <p className="admin-field-hint" style={{ margin: '4px 0 0' }}>
            Logo, homepage, Event Details heading and footer. Leave a field empty to keep the
            site&apos;s default; fill it in whenever the details arrive.
          </p>
        </div>
        <div className="admin-website-save">
          {isDirty && !isSaving && <span className="admin-hero-field-badge">Unsaved changes</span>}
          <button
            type="button"
            className="btn btn-primary admin-action-btn"
            onClick={handleSave}
            disabled={isSaving || isProcessing}
            style={{ gap: '6px' }}
          >
            {isSaving ? <RefreshCw size={18} className="spin" /> : <Save size={18} />}
            <span className="admin-action-label">
              {isSaving ? ((pendingBrand || pendingHero) ? 'Uploading logo…' : 'Saving…') : 'Save Changes'}
            </span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`admin-save-msg ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.tone === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />} {message.text}
        </div>
      )}

      <div className="admin-event-form glass">
        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <h4 className="admin-form-section-title">Logo</h4>
        <LogoField
          label="Header & footer logo"
          value={form.brand_logo}
          savedValue={row.brand_logo || ''}
          pending={pendingBrand}
          background={form.brand_logo_plate}
          disabled={isSaving}
          backgrounds={LOGO_PLATES}
          backgroundLabel="Plate"
          allowRemove
          onProcessing={(busy) => setProcessing(p => ({ ...p, brand: busy }))}
          onPending={(next) => {
            setPendingBrand(next);
            if (next) set('brand_logo_plate', next.logo.suggestedBackground);
            setMessage(null);
          }}
          onChange={(url) => set('brand_logo', url)}
          onBackground={(plate) => set('brand_logo_plate', plate)}
          hint={
            <>
              Top left of every page, in the phone menu and in the footer, drawn about 44 px tall.
              Empty: the current round logo. Plate White suits dark lettering; None suits a logo
              cut out on transparency. Goes live when you click Save Changes.
            </>
          }
        />
        <div className="admin-media-form-grid" style={{ marginTop: '1rem' }}>
          <div className="admin-media-form-group">
            <label htmlFor="web-brand-name">Name beside the logo</label>
            <input
              id="web-brand-name"
              name="brand_name"
              value={form.brand_name}
              onChange={onInput}
              placeholder={DEFAULT_BRAND_NAME}
              maxLength={40}
              disabled={!form.brand_name_visible}
            />
            <span className="admin-field-hint">Empty: {DEFAULT_BRAND_NAME}.</span>
          </div>
          <div className="admin-media-form-group">
            <span className="admin-image-field-label" style={{ marginBottom: 4 }}>Name</span>
            <div className="admin-event-toggle">
              <label className="admin-toggle-label">
                <input type="checkbox" name="brand_name_visible" checked={form.brand_name_visible} onChange={onInput} className="admin-toggle-checkbox" />
                <span className="admin-toggle-switch"></span>
                <span>{form.brand_name_visible ? 'Shown beside the logo' : 'Hidden: the logo stands alone'}</span>
              </label>
            </div>
            <span className="admin-field-hint">Hide it if the new logo already spells out the name.</span>
          </div>
        </div>

        {/* ── Homepage hero ────────────────────────────────────────────── */}
        <h4 className="admin-form-section-title" style={{ marginTop: '1.75rem' }}>Homepage</h4>
        <LogoField
          label="Hero logo (big, on the front page)"
          value={form.hero_logo}
          savedValue={row.hero_logo || ''}
          pending={pendingHero}
          background={form.hero_logo_plate}
          disabled={isSaving}
          backgrounds={LOGO_PLATES}
          backgroundLabel="Plate"
          prepareOptions={HERO_LOGO_BOX}
          allowRemove
          previewClassName="admin-logo-preview--hero"
          previewImage={event?.hero_image}
          onProcessing={(busy) => setProcessing(p => ({ ...p, hero: busy }))}
          onPending={(next) => {
            setPendingHero(next);
            if (next) set('hero_logo_plate', next.logo.suggestedBackground === 'dark' ? 'none' : 'light');
            setMessage(null);
          }}
          onChange={(url) => set('hero_logo', url)}
          onBackground={(plate) => set('hero_logo_plate', plate)}
          hint={
            <>
              Shown large over the hero photo, where the &ldquo;GODA EPIC TRAIL&rdquo; headline is now.
              A white logo cut out on transparency (PNG or SVG) with Plate None suits the photo best;
              the preview shows it on the current hero photo. Empty: the headline text only.
            </>
          }
        />

        <div className="admin-media-form-grid" style={{ marginTop: '1rem' }}>
          <div className="admin-media-form-group">
            <label htmlFor="web-hero-placement">Where the hero logo goes</label>
            <select
              id="web-hero-placement"
              name="hero_logo_placement"
              value={form.hero_logo_placement}
              onChange={onInput}
              disabled={!hasHeroLogo}
            >
              {HERO_LOGO_PLACEMENTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="admin-field-hint">
              {hasHeroLogo
                ? 'Instead: the logo takes the headline’s place (the headline stays readable to search engines and screen readers).'
                : 'Upload a hero logo to choose.'}
            </span>
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="web-cta-effect">Register Now button</label>
            <select id="web-cta-effect" name="hero_cta_effect" value={form.hero_cta_effect} onChange={onInput}>
              {CTA_EFFECTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="admin-field-hint">
              Draws the eye to the main button in the hero. Pulse: it pops every few seconds. Glow: a
              soft glow fades in and out. Either pauses under the pointer, and never plays for
              visitors whose phone is set to reduce motion.
            </span>
          </div>
        </div>

        <div className="admin-media-form-grid" style={{ marginTop: '0.75rem' }}>
          <div className="admin-media-form-group">
            <label htmlFor="web-distances">Distances box in the hero</label>
            <select id="web-distances" name="hero_distances" value={form.hero_distances} onChange={onInput}>
              {DISTANCE_MODES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {form.hero_distances === 'custom' && (
              <input
                name="hero_distances_text"
                value={form.hero_distances_text}
                onChange={onInput}
                placeholder="3K · 5K · 10K · 15K · 21K"
                aria-label="Distances box text"
                maxLength={60}
                style={{ marginTop: '0.5rem' }}
              />
            )}
          </div>
          <div className="admin-media-form-group">
            <span className="admin-image-field-label" style={{ marginBottom: 4 }}>Visitors will see</span>
            <p className="admin-website-preview-line">{distancesPreview || '—'}</p>
            <span className="admin-field-hint">
              {form.hero_distances === 'custom'
                ? 'Exactly the text you type, e.g. 3K Obstacle · 5K · 10K · 15K · 21K.'
                : 'Worked out from Admin → Categories, so a new distance shows up by itself.'}
            </span>
          </div>
        </div>

        {/* ── Event Details page ───────────────────────────────────────── */}
        <h4 className="admin-form-section-title" style={{ marginTop: '1.75rem' }}>Event Details page</h4>
        <div className="admin-media-form-group">
          <label htmlFor="web-event-heading">Page heading</label>
          <input
            id="web-event-heading"
            name="event_heading"
            value={form.event_heading}
            onChange={onInput}
            placeholder={event?.name || 'GODA Epic Trail Run 2026'}
            maxLength={60}
          />
          <span className="admin-field-hint">
            The big heading at the top of /event. Empty: the event name from Settings. The word
            &ldquo;Trail&rdquo; is highlighted in orange. The browser tab title and emails keep the event name.
          </span>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <h4 className="admin-form-section-title" style={{ marginTop: '1.75rem' }}>Footer</h4>
        <span className="admin-image-field-label">Contact numbers</span>
        {contacts.length === 0 ? (
          <p className="admin-field-hint" style={{ marginTop: 0 }}>
            No numbers yet. Add one and it appears under Contact &amp; Support on every page.
          </p>
        ) : (
          <ul className="admin-website-contacts">
            {contacts.map((c, i) => (
              <li key={i} className="admin-website-contact">
                <div className="admin-media-form-group">
                  <label htmlFor={`web-contact-name-${i}`}>Name</label>
                  <input id={`web-contact-name-${i}`} value={c.name} onChange={(e) => setContact(i, 'name', e.target.value)} placeholder="Akash Gadekar" maxLength={40} />
                </div>
                <div className="admin-media-form-group">
                  <label htmlFor={`web-contact-role-${i}`}>Role <span className="text-muted">(optional)</span></label>
                  <input id={`web-contact-role-${i}`} value={c.role} onChange={(e) => setContact(i, 'role', e.target.value)} placeholder="Registrations" maxLength={40} />
                </div>
                <div className="admin-media-form-group">
                  <label htmlFor={`web-contact-phone-${i}`}>Phone</label>
                  <input id={`web-contact-phone-${i}`} value={c.phone} onChange={(e) => setContact(i, 'phone', e.target.value)} placeholder="98765 43210" inputMode="tel" autoComplete="off" maxLength={20} />
                </div>
                <label className="admin-inline-check admin-website-contact-wa">
                  <input type="checkbox" checked={c.whatsapp} onChange={(e) => setContact(i, 'whatsapp', e.target.checked)} />
                  WhatsApp
                </label>
                <div className="admin-content-actions admin-website-contact-actions">
                  <button type="button" className="admin-cat-action-btn" onClick={() => moveContact(i, -1)} disabled={i === 0} aria-label={`Move ${c.name || 'contact'} up`}><ArrowUp size={14} /></button>
                  <button type="button" className="admin-cat-action-btn" onClick={() => moveContact(i, 1)} disabled={i === contacts.length - 1} aria-label={`Move ${c.name || 'contact'} down`}><ArrowDown size={14} /></button>
                  <button type="button" className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => removeContact(i)} aria-label={`Remove ${c.name || 'contact'}`}><Trash2 size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="admin-cat-action-btn"
          onClick={addContact}
          disabled={contacts.length >= MAX_FOOTER_CONTACTS}
          style={{ marginTop: '0.5rem' }}
        >
          <Plus size={14} /> Add number
        </button>
        <span className="admin-field-hint">
          Tapping a number on a phone calls it; WhatsApp adds a chat button beside it. A 10-digit
          number is taken as Indian (+91). Up to {MAX_FOOTER_CONTACTS}.
        </span>

        <div className="admin-media-form-group" style={{ marginTop: '1rem' }}>
          <label htmlFor="web-footer-about">Line under the footer logo</label>
          <textarea
            id="web-footer-about"
            name="footer_about"
            value={form.footer_about}
            onChange={onInput}
            rows={2}
            maxLength={240}
            style={{ resize: 'vertical' }}
            placeholder={DEFAULT_FOOTER_ABOUT}
          />
          <span className="admin-field-hint">Empty: the line shown in grey above.</span>
        </div>
        <div className="admin-media-form-group" style={{ marginTop: '0.75rem', maxWidth: '420px' }}>
          <label htmlFor="web-footer-copyright">Copyright name</label>
          <input
            id="web-footer-copyright"
            name="footer_copyright"
            value={form.footer_copyright}
            onChange={onInput}
            placeholder={ORGANISATION.legalName}
            maxLength={60}
          />
          <span className="admin-field-hint">
            Shown as &ldquo;&copy; {new Date().getFullYear()} {form.footer_copyright.trim() || ORGANISATION.legalName}.
            All rights reserved.&rdquo; The policy pages keep the registered name, {ORGANISATION.legalName}.
          </span>
        </div>
      </div>

      {/* ── Guests of Honour ───────────────────────────────────────────── */}
      <div className="admin-event-form glass" style={{ marginTop: '1.5rem' }}>
        <h4 className="admin-form-section-title">Homepage: Guests of Honour</h4>
        <p className="admin-field-hint" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
          Photos of well-known people, in a highlighted band on the homepage below &ldquo;The Story So
          Far&rdquo;. The band appears once one guest is visible. The heading and line save with Save
          Changes; each guest saves from its own form.
        </p>
        <div className="admin-media-form-grid">
          <div className="admin-media-form-group">
            <label htmlFor="web-guests-heading">Heading</label>
            <input id="web-guests-heading" name="guests_heading" value={form.guests_heading} onChange={onInput} placeholder={DEFAULT_GUESTS_HEADING} maxLength={50} />
            <span className="admin-field-hint">The last word is highlighted in orange.</span>
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="web-guests-intro">Line under the heading</label>
            <input id="web-guests-intro" name="guests_intro" value={form.guests_intro} onChange={onInput} placeholder={DEFAULT_GUESTS_INTRO} maxLength={160} />
          </div>
        </div>
        <div style={{ marginTop: '1.25rem' }}>
          <GuestManager />
        </div>
      </div>
    </div>
  );
}
