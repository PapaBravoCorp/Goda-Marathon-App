import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Check, Loader, AlertCircle } from 'lucide-react';
import { FaInstagram, FaFacebook } from 'react-icons/fa';
import { subscribe } from '../utils/services/newsletter';
import { ORGANISATION } from '../utils/constants';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error
  const [message, setMessage] = useState('');

  /**
   * Previously this flipped a flag to show "Subscribed!" and discarded the
   * address. It now records it, and reports a failure rather than claiming
   * success regardless.
   */
  const handleSubscribe = async (e) => {
    e.preventDefault();
    if (state === 'sending') return;

    setState('sending');
    setMessage('');
    try {
      await subscribe(email, 'footer');
      setState('done');
      setMessage('You are on the list. Watch your inbox for race news.');
      setEmail('');
    } catch (err) {
      setState('error');
      setMessage(err.message);
    }
  };

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <Link to="/" className="brand" style={{ marginBottom: '24px', display: 'flex' }}>
              <Activity color="var(--color-primary)" size={28} />
              <span>GODA<span className="text-primary">.</span></span>
            </Link>
            <p className="text-muted" style={{ maxWidth: '300px', marginBottom: '24px' }}>
              Bringing people together through the power of sport. Organised by{' '}
              {ORGANISATION.name} and {ORGANISATION.coOrganiser}.
            </p>
            {/* These pointed at href="#", so every one of them scrolled the
                visitor to the top of the page instead of opening anything. */}
            <div className="flex gap-sm">
              <a
                href={ORGANISATION.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline"
                style={{ padding: '8px', borderRadius: '50%' }}
                aria-label={`${ORGANISATION.name} on Instagram`}
              >
                <FaInstagram size={20} aria-hidden="true" />
              </a>
              <a
                href={ORGANISATION.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline"
                style={{ padding: '8px', borderRadius: '50%' }}
                aria-label={`${ORGANISATION.name} on Facebook`}
              >
                <FaFacebook size={20} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div>
            <h2 className="footer-title">Quick Links</h2>
            <ul className="footer-links">
              <li><Link to="/event">Event Details</Link></li>
              <li><Link to="/register">Register</Link></li>
              <li><Link to="/results">Results</Link></li>
              <li><Link to="/past-events">Past Events</Link></li>
            </ul>
          </div>

          <div>
            <h2 className="footer-title">Contact &amp; Support</h2>
            <ul className="footer-links">
              <li><Link to="/contact">Contact Us</Link></li>
              {/* Was href="#". The FAQ is a section on the homepage. */}
              <li><Link to="/#faq">FAQ</Link></li>
              <li><a href={`tel:${ORGANISATION.phone.replace(/\s+/g, '')}`}>{ORGANISATION.phone}</a></li>
              <li><a href={`mailto:${ORGANISATION.email}`}>{ORGANISATION.email}</a></li>
              <li className="text-muted" style={{ fontSize: '0.9rem' }}>{ORGANISATION.address}</li>
            </ul>
          </div>

          <div>
            <h2 className="footer-title">Newsletter</h2>
            <p className="text-muted" style={{ marginBottom: '16px' }}>
              Stay updated with the latest race news.
            </p>
            <form className="flex gap-sm" style={{ flexWrap: 'wrap' }} onSubmit={handleSubscribe}>
              <label htmlFor="newsletter-email" className="sr-only">Your email address</label>
              <input
                id="newsletter-email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (state !== 'idle') { setState('idle'); setMessage(''); } }}
                placeholder="Your email address"
                style={{ flex: '1 1 0', minWidth: '0' }}
                required
                autoComplete="email"
                disabled={state === 'sending'}
              />
              <button
                type="submit"
                className="btn btn-primary flex items-center justify-center transition-all"
                style={{
                  padding: '12px 20px',
                  width: 'auto',
                  flex: '0 0 auto',
                  whiteSpace: 'nowrap',
                  backgroundColor: state === 'done' ? '#10b981' : 'var(--color-primary)',
                }}
                disabled={state === 'sending' || state === 'done'}
              >
                {state === 'sending' && <><Loader size={18} className="spin" style={{ marginRight: '8px' }} aria-hidden="true" /> Signing up</>}
                {state === 'done' && <><Check size={18} style={{ marginRight: '8px' }} aria-hidden="true" /> Done</>}
                {(state === 'idle' || state === 'error') && 'Join'}
              </button>
            </form>

            {message && (
              <p
                role="status"
                style={{
                  marginTop: '12px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  color: state === 'error' ? 'var(--color-danger)' : 'var(--color-primary)',
                }}
              >
                {state === 'error' && <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />}
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="copyright">
          <p>© {new Date().getFullYear()} {ORGANISATION.legalName}. All rights reserved.</p>
          {/* Every live site needs these reachable from every page, and a
              payment gateway will check for them during onboarding. */}
          <nav className="footer-legal" aria-label="Policies">
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/terms">Terms &amp; Conditions</Link>
            <Link to="/refund-policy">Cancellation &amp; Refunds</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/admin" className="footer-admin-link">Admin</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
