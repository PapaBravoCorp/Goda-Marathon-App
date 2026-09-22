import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Lock, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentEvent } from '../utils/services/events';
import './Navbar.css';

const NAV_ITEMS = [
  { to: '/', label: 'Home' },
  { to: '/event', label: 'Event Details' },
  { to: '/past-events', label: 'Past Events' },
  { to: '/results', label: 'Results' },
];

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    getCurrentEvent().then(ev => {
      if (ev) setRegistrationOpen(ev.registration_open);
    });
  }, []);

  const menuRef = useRef(null);
  const openerRef = useRef(null);

  // Body scroll lock
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMenuOpen]);

  /**
   * Make the full-screen menu behave like the dialog it is.
   *
   * It covered the whole viewport but had none of the behaviour that implies:
   * Escape did nothing, focus stayed on the page underneath, and Tab walked
   * invisibly through the navigation and footer behind the overlay. A
   * keyboard or screen-reader user could open it and have no way out.
   */
  useEffect(() => {
    if (!isMenuOpen) return;

    const menu = menuRef.current;
    const focusable = () =>
      Array.from(
        menu?.querySelectorAll('a[href], button:not([disabled])') ?? []
      ).filter(el => el.offsetParent !== null);

    focusable()[0]?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;

      // Cycle within the overlay rather than escaping to the page behind it.
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Put focus back where it came from, not at the top of the document.
      openerRef.current?.focus();
    };
  }, [isMenuOpen]);

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location]);

  return (
    <>
      <nav className={`navbar ${isScrolled ? 'is-scrolled' : ''}`}>
        <div className="container nav-container">
          <Link to="/" className="brand" aria-label="GODA home">
            <span className="brand-mark" aria-hidden="true"><Activity size={20} strokeWidth={2.5} /></span>
            <span className="brand-word">GODAVARI EXPEDITION<span className="brand-dot">.</span></span>
          </Link>

          <div className="nav-links">
            {NAV_ITEMS.map(item => {
              const isActive = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`nav-link ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="nav-actions">
            {registrationOpen ? (
              <Link to="/register" className="nav-cta">Register</Link>
            ) : (
              <Link to="/event" className="nav-cta nav-cta--muted">View Event</Link>
            )}
            <Link to="/admin" className="nav-icon-btn" aria-label="Admin dashboard" title="Admin dashboard">
              <Lock size={16} />
            </Link>
            <button
              ref={openerRef}
              className="mobile-menu-btn"
              onClick={() => setIsMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Premium Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            ref={menuRef}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            initial={{ opacity: 0, y: '-100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[1001] bg-[#0b0b0b]/95 backdrop-blur-xl flex flex-col pt-6 px-6"
            style={{ minHeight: '100dvh' }}
          >
            <div className="flex justify-between items-center mb-12">
              <Link to="/" className="brand">
                <span className="brand-mark" aria-hidden="true"><Activity size={20} strokeWidth={2.5} /></span>
                <span className="brand-word">GODA<span className="brand-dot">.</span></span>
              </Link>
              <button 
                className="mobile-menu-close"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Close menu"
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Driven by the same NAV_ITEMS as the desktop bar, so a new route
                is added in one place instead of two. */}
            <nav className="flex flex-col gap-6 text-2xl font-bold" aria-label="Main">
              {NAV_ITEMS.map(item => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`pb-2 border-b border-white/10 ${location.pathname === item.to ? 'text-primary' : 'text-white'}`}
                  aria-current={location.pathname === item.to ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto mb-12 flex flex-col gap-4">
              {registrationOpen ? (
                <Link to="/register" className="btn btn-primary w-full py-4 text-xl">Register Now</Link>
              ) : (
                <Link to="/event" className="btn btn-outline w-full py-4 text-xl">View Event</Link>
              )}
              <Link to="/admin" className="flex items-center justify-center gap-2 text-gray-400 py-4 w-full">
                <Lock size={18} /> <span>Admin Dashboard</span>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
