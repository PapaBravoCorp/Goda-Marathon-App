import React from 'react';

/**
 * An admin-written heading with its last word highlighted, like the other
 * section headings: "Guests of Honour" → "Guests of " + orange "Honour".
 */
export function AccentHeading({ text }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const last = words.pop();
  return (
    <>
      {words.length > 0 && `${words.join(' ')} `}
      <span className="accent-text">{last}</span>
    </>
  );
}
