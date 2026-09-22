import { useEffect } from 'react';
import { ORGANISATION } from '../utils/constants';

/**
 * schema.org SportsEvent record for the homepage.
 *
 * Without it a search result for "goda trail run" is a title and a snippet.
 * With it, Google can show the date, the venue and the entry price in the
 * result itself, and the page becomes eligible for the event listings that
 * appear above ordinary results for "running events near Nashik".
 *
 * Built from the live event row rather than written into index.html, because
 * the date, venue and prices are all edited in the admin panel -- a static copy
 * would go stale the first time an organiser changed one, and publishing a
 * wrong date as structured data is worse than publishing none.
 */

const SCRIPT_ID = 'goda-event-jsonld';

/** "2026-12-20" + "06:00 AM" → "2026-12-20T06:00:00+05:30" */
function toIsoWithOffset(dateStr, timeStr) {
  if (!dateStr) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((timeStr || '').trim());
  let hours = 0;
  let minutes = '00';
  if (match) {
    hours = parseInt(match[1], 10);
    minutes = match[2];
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  }
  // The race is in India; stating the offset stops a crawler reading the time
  // as UTC and advertising a start five and a half hours out.
  return `${dateStr}T${String(hours).padStart(2, '0')}:${minutes}:00+05:30`;
}

export default function EventStructuredData({ event, categories = [] }) {
  useEffect(() => {
    if (!event?.name || !event?.date) return;

    const startDate = toIsoWithOffset(event.date, event.flag_off_time);

    const offers = categories
      .filter(c => c.price != null)
      .map(c => ({
        '@type': 'Offer',
        name: c.name,
        price: String(c.price),
        priceCurrency: 'INR',
        availability:
          (c.status || 'Open') === 'Open'
            ? 'https://schema.org/InStock'
            : 'https://schema.org/SoldOut',
        url: `${window.location.origin}/register`,
        validThrough: event.last_registration_date || event.date,
      }));

    const data = {
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      name: event.name,
      description: event.description || event.hero_subcopy || undefined,
      startDate,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      sport: 'Trail running',
      image: event.hero_image
        ? [event.hero_image.startsWith('http')
            ? event.hero_image
            : `${window.location.origin}${event.hero_image}`]
        : undefined,
      location: {
        '@type': 'Place',
        name: event.venue || event.location,
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Nashik',
          addressRegion: 'Maharashtra',
          addressCountry: 'IN',
        },
      },
      organizer: {
        '@type': 'Organization',
        name: ORGANISATION.legalName,
        url: window.location.origin,
        email: event.contact_email || ORGANISATION.email,
      },
      offers: offers.length > 0 ? offers : undefined,
    };

    let script = document.getElementById(SCRIPT_ID);
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);

    return () => {
      // Removed on unmount so the event record does not linger in the head
      // while the visitor reads the privacy policy.
      document.getElementById(SCRIPT_ID)?.remove();
    };
  }, [event, categories]);

  return null;
}
