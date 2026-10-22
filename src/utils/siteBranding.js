import { ORGANISATION } from './constants';

/**
 * Admin -> Website settings (site_settings, migration 0020): the choices the
 * admin panel offers, the defaults the site falls back to, and the checks run
 * on save. Public pages call resolveSiteBranding() rather than reading the row
 * directly, so a missing column or a cleared field always lands on a sensible
 * default.
 */

export const DEFAULT_BRAND_NAME = 'GODA EPIC TRAIL';
export const DEFAULT_BRAND_LOGO = '/banner/logo-mark.png';
export const DEFAULT_FOOTER_ABOUT =
  `Bringing people together through the power of sport. Organised by ${ORGANISATION.name} and ${ORGANISATION.coOrganiser}.`;
export const DEFAULT_GUESTS_HEADING = 'Guests of Honour';
export const DEFAULT_GUESTS_INTRO = 'Champions and well-known faces who have joined us at the start line.';

export const MAX_FOOTER_CONTACTS = 6;

export const LOGO_PLATES = [
  { value: 'light', label: 'White' },
  { value: 'dark', label: 'Dark' },
  { value: 'none', label: 'None' },
];

export const HERO_LOGO_PLACEMENTS = [
  { value: 'replace', label: 'Instead of the headline' },
  { value: 'above', label: 'Above the headline' },
];

export const CTA_EFFECTS = [
  { value: 'pulse', label: 'Pulse' },
  { value: 'glow', label: 'Glow' },
  { value: 'none', label: 'Off' },
];

export const DISTANCE_MODES = [
  { value: 'list', label: 'Each distance' },
  { value: 'range', label: 'Shortest to longest' },
  { value: 'custom', label: 'My own text' },
];

const isOption = (value, options) => options.some(o => o.value === value);
const pick = (value, options, fallback) => (isOption(value, options) ? value : fallback);
const text = (value) => (typeof value === 'string' && value.trim()) || null;

/**
 * Digits of a phone number with its country code, for tel: and WhatsApp
 * links: "98765 43210", "098765-43210" and "+91 98765 43210" all give
 * "919876543210". A number without a country code is taken as Indian. Null
 * when the result cannot be a phone number.
 */
export function phoneDigits(raw) {
  const value = String(raw || '').trim();
  let digits = value.replace(/\D/g, '');
  if (!digits) return null;

  if (!value.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);                        // 0091 98765 43210
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1); // 098765 43210, 0253 2345678
    if (digits.length === 10) digits = `91${digits}`;
  }
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** "919876543210" → "+91 98765 43210". Other countries keep the + and their digits. */
export function formatPhone(digits) {
  if (/^91\d{10}$/.test(digits)) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}

/** The footer's contacts as the site shows them; anything unusable is skipped. */
function readContacts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(c => {
      const digits = phoneDigits(c?.phone);
      const name = text(c?.name);
      if (!digits || !name) return null;
      return {
        name,
        role: text(c?.role),
        display: formatPhone(digits),
        telHref: `tel:+${digits}`,
        whatsappHref: c?.whatsapp === false ? null : `https://wa.me/${digits}`,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_FOOTER_CONTACTS);
}

/**
 * Admin save: drop empty rows, check the rest. Returns { contacts } ready for
 * the database, or { error } naming the row to fix.
 */
export function cleanFooterContacts(rows) {
  const filled = (rows || []).filter(r => [r.name, r.role, r.phone].some(v => String(v || '').trim()));
  if (filled.length > MAX_FOOTER_CONTACTS) {
    return { error: `The footer has room for ${MAX_FOOTER_CONTACTS} contact numbers. Remove one and save again.` };
  }

  const contacts = [];
  for (const [i, row] of filled.entries()) {
    const label = text(row.name) || `Contact ${i + 1}`;
    if (!text(row.name)) return { error: `Contact ${i + 1} needs a name.` };
    if (!text(row.phone)) return { error: `${label} needs a phone number.` };
    const digits = phoneDigits(row.phone);
    if (!digits) {
      return { error: `${label}: "${row.phone.trim()}" is not a phone number. Use 10 digits, e.g. 98765 43210, or start with + and the country code.` };
    }
    contacts.push({
      name: text(row.name),
      role: text(row.role),
      phone: formatPhone(digits),
      whatsapp: row.whatsapp !== false,
    });
  }
  return { contacts };
}

/**
 * Everything the public pages read from Admin -> Website, with defaults filled
 * in. Accepts null or a row from before migration 0020; the defaults for the
 * two settings that change the look (CTA effect, distances) then match what
 * the site did before, so nothing moves until the migration runs.
 */
export function resolveSiteBranding(row) {
  const s = row || {};
  return {
    brandLogo: text(s.brand_logo),
    brandLogoPlate: pick(s.brand_logo_plate, LOGO_PLATES, 'light'),
    brandName: text(s.brand_name) || DEFAULT_BRAND_NAME,
    hasCustomBrandName: !!text(s.brand_name),
    showBrandName: s.brand_name_visible !== false,

    heroLogo: text(s.hero_logo),
    heroLogoPlate: pick(s.hero_logo_plate, LOGO_PLATES, 'none'),
    heroLogoPlacement: pick(s.hero_logo_placement, HERO_LOGO_PLACEMENTS, 'replace'),
    ctaEffect: pick(s.hero_cta_effect, CTA_EFFECTS, 'none'),
    distancesMode: pick(s.hero_distances, DISTANCE_MODES, 'range'),
    distancesText: text(s.hero_distances_text),

    eventHeading: text(s.event_heading),

    footerAbout: text(s.footer_about) || DEFAULT_FOOTER_ABOUT,
    footerCopyright: text(s.footer_copyright) || ORGANISATION.legalName,
    footerContacts: readContacts(s.footer_contacts),

    guestsHeading: text(s.guests_heading) || DEFAULT_GUESTS_HEADING,
    guestsIntro: text(s.guests_intro) || DEFAULT_GUESTS_INTRO,
  };
}
