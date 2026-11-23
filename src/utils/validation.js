export const isValidPhone = (phone) => {
  return /^[6-9]\d{9}$/.test(phone);
};

export const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidPincode = (pincode) => {
  return /^[1-9][0-9]{5}$/.test(pincode);
};

export const calculateAge = (dob) => {
  if (!dob) return null;
  const today = new Date();
  const birthDate = new Date(dob);
  let a = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    a--;
  }
  return a;
};

/**
 * A runner's name as the database compares it (runner_name_key(), 0030):
 * first and last joined, lower-cased, runs of whitespace collapsed. One email
 * may cover several runners, so a runner is the email together with this.
 */
export const runnerNameKey = (firstName, lastName) =>
  `${firstName || ''} ${lastName || ''}`.replace(/\s+/g, ' ').trim().toLowerCase();
