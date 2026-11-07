import React, { useEffect, useState } from 'react';
import { suggestEmail } from '../../utils/emailTypos';

/**
 * "Did you mean asha@gmail.com? [Use this]" under an email field.
 *
 * Waits until the runner pauses typing, so "asha@gmail" on its way to
 * "asha@gmail.com" is not flagged mid-word.
 */
export default function EmailSuggestion({ email, onAccept }) {
  const [settled, setSettled] = useState(email);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(email), 700);
    return () => clearTimeout(timer);
  }, [email]);

  const suggestion = settled === email ? suggestEmail(email) : null;
  if (!suggestion) return null;

  return (
    <div className="reg-email-suggest" role="status">
      <span>Did you mean <strong>{suggestion}</strong>?</span>
      <button type="button" onClick={() => onAccept(suggestion)}>Use this</button>
    </div>
  );
}
