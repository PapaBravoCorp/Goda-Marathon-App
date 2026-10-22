import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserRound } from 'lucide-react';
import { resolveImageUrl } from '../utils/mediaUrl';

/** Photo, or a placeholder when it fails to load. The name is right below, so the photo itself is decorative. */
function GuestPhoto({ src }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className="guest-photo guest-photo--empty" aria-hidden="true">
        <UserRound size={44} />
      </span>
    );
  }

  return (
    <img
      className="guest-photo"
      src={resolveImageUrl(src, 640)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** "Guests of Honour" → "Guests of " + highlighted "Honour", like the other section headings. */
function AccentHeading({ text }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const last = words.pop();
  return (
    <>
      {words.length > 0 && `${words.join(' ')} `}
      <span className="accent-text">{last}</span>
    </>
  );
}

/**
 * "Guests of Honour": well-known people who have joined the race, with their
 * photo, from Admin -> Website. A dark band, so it stands out on the page.
 * Renders nothing until at least one guest is published.
 */
export function FeaturedGuests({ guests, heading, intro }) {
  if (guests.length === 0) return null;

  return (
    <section className="section guests-section" data-theme="dark" aria-labelledby="guests-heading">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="container"
      >
        <div className="text-center guests-head">
          <h2 id="guests-heading"><AccentHeading text={heading} /></h2>
          {intro && <p className="text-muted">{intro}</p>}
        </div>

        <ul className={`guests-grid${guests.length <= 2 ? ' is-few' : ''}`}>
          {guests.map(guest => (
            <li key={guest.id} className="guest-card">
              <GuestPhoto src={guest.photo_url} />
              {guest.badge && <span className="guest-badge">{guest.badge}</span>}
              <div className="guest-caption">
                <h3 className="guest-name">{guest.name}</h3>
                {guest.credential && <p className="guest-credential">{guest.credential}</p>}
              </div>
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
