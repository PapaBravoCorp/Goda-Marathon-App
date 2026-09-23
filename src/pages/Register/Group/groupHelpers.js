/**
 * Shared constants and formatters for the group flow.
 *
 * Kept out of the component modules because react-refresh requires those to
 * export only components — the same reason controls.js exists alongside
 * Field.jsx.
 */

/** Mirrors the bounds create_group_registration() enforces in the database. */
export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 50;

export const TSHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

/**
 * Same stored values as the solo form (StepDetails.jsx), so the two flows do
 * not fill one column with "male" and "Male" and leave every later count and
 * export to reconcile them.
 */
export const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other / Prefer not to say' },
];

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
