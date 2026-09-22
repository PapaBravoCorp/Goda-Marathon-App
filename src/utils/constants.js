// ─── ORGANISER DETAILS ───────────────────────────────────────────────────────
// Single source of truth for contact details shown in the footer, on the policy
// pages and in the structured data in index.html. They were previously typed
// out again in each place, so correcting a phone number meant finding every
// copy.
//
// TODO (organisers): replace `legalName`, `address` and `jurisdiction` with the
// registered entity details before launch. A payment gateway will ask for the
// registered name and address during merchant onboarding, and they must match
// what the policy pages say.
export const ORGANISATION = {
  name: 'Godavari Expedition',
  legalName: 'Godavari Expedition',
  coOrganiser: 'G5 Foundation',
  email: 'godavariexpedition@gmail.com',
  phone: '+91 82085 92273',
  address: 'Tidke Colony, Nashik, Maharashtra, India',
  jurisdiction: 'Nashik, Maharashtra',
  instagram: 'https://www.instagram.com/godavari_expedition/',
  facebook: 'https://www.facebook.com/godavariexpedition/',
};

// ─── LEGACY FALLBACKS ────────────────────────────────────────
// These are used ONLY when the DB (event_categories table) is empty.
// All category data is now managed via Admin → Categories tab.
export const CATEGORY_PRICING = {
  "5K Run": 499,
  "10K Run": 799,
  "Half Marathon": 1299,
  "Full Marathon": 1599
};

export const CATEGORY_RULES = {
  "5K Run": { minAge: 5 },
  "10K Run": { minAge: 12 },
  "Half Marathon": { minAge: 18 },
  "Full Marathon": { minAge: 18 }
};

// Human-readable event identifier for routing and the registrations table.
// On this project events.id is the slug itself ("goda-2026"), so the two are
// the same value; getCurrentEvent() remains the authoritative source.
export const CURRENT_EVENT = {
  slug: "goda-2026",
  name: "GODA Epic Trail Run 2026"
};

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];
