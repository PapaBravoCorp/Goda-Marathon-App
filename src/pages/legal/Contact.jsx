import React, { useState, useEffect } from 'react';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';
// lucide-react dropped its brand icons in v1; react-icons carries them, and the
// footer already uses it for the same two logos.
import { FaInstagram, FaFacebook } from 'react-icons/fa';
import LegalPage from './LegalPage';
import { ORGANISATION } from '../../utils/constants';
import { getCurrentEvent } from '../../utils/services/events';

/**
 * Contact details.
 *
 * A real, reachable contact page is the thing a visitor looks for when
 * something has gone wrong with their entry, and it is also the first thing a
 * payment gateway asks to see during merchant onboarding.
 *
 * Contact details come from the event row where the organisers have set them in
 * Settings, and fall back to the constants otherwise -- so updating them does
 * not need a deploy.
 */
export default function Contact() {
  const [event, setEvent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getCurrentEvent().then(ev => { if (!cancelled) setEvent(ev); });
    return () => { cancelled = true; };
  }, []);

  const email = event?.contact_email || ORGANISATION.email;
  const phone = event?.contact_phone || ORGANISATION.phone;

  return (
    <LegalPage
      title="Contact Us"
      description={`Get in touch with ${ORGANISATION.name} about the GODA Epic Trail Run — registration, payment, bib collection or race-day questions.`}
    >
      <p>
        The GODA Epic Trail Run is organised by {ORGANISATION.legalName} together
        with {ORGANISATION.coOrganiser}. For anything to do with your registration,
        payment, bib collection or the route, reach us here.
      </p>

      <ul className="legal-contact-list">
        <li>
          <Mail size={18} aria-hidden="true" />
          <div>
            <span className="legal-contact-label">Email</span>
            <a href={`mailto:${email}`}>{email}</a>
          </div>
        </li>
        <li>
          <Phone size={18} aria-hidden="true" />
          <div>
            <span className="legal-contact-label">Phone</span>
            <a href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a>
          </div>
        </li>
        <li>
          <MapPin size={18} aria-hidden="true" />
          <div>
            <span className="legal-contact-label">Address</span>
            {ORGANISATION.address}
          </div>
        </li>
        {event?.venue && (
          <li>
            <MapPin size={18} aria-hidden="true" />
            <div>
              <span className="legal-contact-label">Race venue</span>
              {event.venue}
            </div>
          </li>
        )}
        <li>
          <Clock size={18} aria-hidden="true" />
          <div>
            <span className="legal-contact-label">When we reply</span>
            Within five working days. Closer to race day, expect a same-day answer
            on the phone.
          </div>
        </li>
      </ul>

      <h2>Follow the event</h2>
      <ul className="legal-contact-list">
        <li>
          <FaInstagram size={18} aria-hidden="true" />
          <div>
            <span className="legal-contact-label">Instagram</span>
            <a href={ORGANISATION.instagram} target="_blank" rel="noopener noreferrer">
              Godavari Expedition
            </a>
          </div>
        </li>
        <li>
          <FaFacebook size={18} aria-hidden="true" />
          <div>
            <span className="legal-contact-label">Facebook</span>
            <a href={ORGANISATION.facebook} target="_blank" rel="noopener noreferrer">
              Godavari Expedition
            </a>
          </div>
        </li>
      </ul>

      <h2>Before you write</h2>
      <p>
        A few questions are answered faster on the site than by email:
      </p>
      <ul>
        <li>Minimum ages and entry fees for each category are on the registration form.</li>
        <li>The race-day timeline is on the event page.</li>
        <li>What happens if you cannot take part is in the Cancellation and Refund Policy.</li>
      </ul>
      <p>
        If you are writing about an existing entry, include the email address you
        registered with and your bib number. It saves a round trip.
      </p>
    </LegalPage>
  );
}
