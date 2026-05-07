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
