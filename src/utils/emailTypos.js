/**
 * "Did you mean …@gmail.com?" for email addresses typed on a phone.
 *
 * Confirmation emails carry the runner's bib. In the first weeks of
 * registration four of them bounced: "gmail.co", a missing letter, a mailbox
 * that does not exist. Nothing told the runner, and nothing told the
 * organisers. This catches the part that can be caught in the browser -- a
 * misspelt provider -- before the entry is made.
 *
 * It only ever suggests. A domain that is not close to a common provider (a
 * company or college address) is left alone, and the forms let the runner
 * keep what they typed.
 */

// Addresses people in India actually use, plus valid look-alikes of them
// (ymail, mail.com) so those are never "corrected".
const KNOWN = [
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.in', 'yahoo.co.in', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.in', 'outlook.com', 'outlook.in', 'live.com', 'live.in', 'msn.com',
  'rediffmail.com', 'rediff.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'proton.me', 'zoho.com', 'zohomail.in',
  'mail.com', 'email.com', 'gmx.com', 'yandex.com',
];

// The providers worth correcting towards. Close to one of these and not a
// known domain itself means a typo.
const TARGETS = ['gmail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'hotmail.com', 'outlook.com', 'rediffmail.com', 'icloud.com'];

// The part before the dot that clearly means a provider, whatever follows it:
// "gmail.co", "gmail.con", "gmail.in" are all gmail.com.
const NAME_TO_DOMAIN = {
  gmail: 'gmail.com',
  hotmail: 'hotmail.com',
  outlook: 'outlook.com',
  rediffmail: 'rediffmail.com',
  icloud: 'icloud.com',
};

const distance = (a, b) => {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
};

/**
 * The corrected address, or null when there is nothing to suggest.
 *
 *   suggestEmail('vikram@gmail.co')   -> 'vikram@gmail.com'
 *   suggestEmail('asha@gmial.com')    -> 'asha@gmail.com'
 *   suggestEmail('asha@yahoo.co.in')  -> null (correct already)
 *   suggestEmail('asha@infosys.com')  -> null (not near a provider)
 */
export const suggestEmail = (raw) => {
  const email = String(raw || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;

  const local = email.slice(0, at);
  let domain = email.slice(at + 1).replace(/\.+$/, '').replace(/,/g, '.');
  if (!domain || KNOWN.includes(domain)) return null;

  // "gmail.co", "gmail.con", "gmail.co.in", "gmail" -- right provider, wrong ending.
  const name = domain.split('.')[0];
  if (NAME_TO_DOMAIN[name]) return `${local}@${NAME_TO_DOMAIN[name]}`;

  // "gmailcom": the dot went missing.
  for (const target of TARGETS) {
    if (domain === target.replace(/\./g, '')) return `${local}@${target}`;
  }

  // One or two letters off a provider: "gmial.com", "gmal.com", "yaho.com".
  let best = null;
  let bestScore = 3;
  for (const target of TARGETS) {
    const d = distance(domain, target);
    if (d < bestScore) {
      best = target;
      bestScore = d;
    }
  }
  // Two edits is a lot for a short domain: "gmx.de" is not "gmail.com".
  if (best && (bestScore === 1 || (bestScore === 2 && domain.length >= 8))) {
    return `${local}@${best}`;
  }
  return null;
};

/**
 * For the submit handlers: an error message the first time an address with a
 * likely typo is submitted, null after that. The runner either takes the
 * suggestion or presses the button again to keep what they typed -- `warned`
 * (a Set the page keeps in a ref) remembers which addresses they were asked
 * about.
 */
export const emailTypoError = (email, warned, buttonLabel = 'Continue') => {
  const key = String(email || '').trim().toLowerCase();
  const suggestion = suggestEmail(key);
  if (!suggestion || warned.has(key)) return null;
  warned.add(key);
  return `Please check this address: your bib and race updates are emailed here. Tap “Use this” above, or press “${buttonLabel}” again if it is right as typed.`;
};
