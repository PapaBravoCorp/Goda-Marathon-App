import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Calendar, MapPin, Users, Trophy, ShieldCheck, ChevronDown, ChevronUp, Loader, Check, Clock, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import Seo from '../components/Seo';
import EventStructuredData from '../components/EventStructuredData';
import { CountdownTimer } from '../components/CountdownTimer';
import { TestimonialCarousel } from '../components/TestimonialCarousel';
import { FaqAccordion } from '../components/FaqAccordion';

import { getCurrentEvent } from '../utils/services/events';
import { getEventCategories } from '../utils/services/categories';
import { CURRENT_EVENT } from '../utils/constants';

// Used only when the DB is unreachable or holds no current event, so the
// landing page degrades to the previous static content instead of blanking.
const FALLBACK_EVENT = {
  name: CURRENT_EVENT.name,
  edition: '3rd',
  date: '2026-08-09',
  flag_off_time: '06:45 AM',
  location: 'Girnare, Nashik',
  hero_image: '/images/trail_hero.png',
  hero_headline: 'RUN BEYOND LIMITS',
  hero_subcopy: 'Push past your limits at the Goda Epic Trail Run 2026. Join us for the ultimate test of endurance, spirit, and connection with nature in the scenic Gangapur Backwaters.',
  registration_open: true,
};

/** "2026-08-09" → "AUG 09, 2026" */
function formatHeroDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const month = d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase();
  const day = String(d.getDate()).padStart(2, '0');
  return `${month} ${day}, ${d.getFullYear()}`;
}

/**
 * Combine the event date with its flag-off time into a value the countdown can
 * parse. Left in local time deliberately — the race starts at 06:45 in Nashik,
 * not 06:45 UTC.
 */
function buildCountdownTarget(dateStr, flagOff) {
  if (!dateStr) return null;
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec((flagOff || '').trim());
  if (!match) return `${dateStr}T00:00:00`;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  return `${dateStr}T${String(hours).padStart(2, '0')}:${minutes}:00`;
}

/** Category price in rupees, no decimals. */
function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(n);
}

/** Leading number out of "15km" / "300m" — NaN-safe for free-text values. */
function toNumber(value) {
  const n = parseFloat(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Renders the headline with its final word highlighted. */
function HeroHeadline({ text }) {
  // filter(Boolean) matters: ''.split(/\s+/) yields [''], not [].
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const last = words.pop();
  return (
    <>
      {words.length > 0 && `${words.join(' ')} `}
      <span className="gradient-text">{last}</span>
    </>
  );
}

export default function Home() {
  const [expandedRoute, setExpandedRoute] = useState(null);
  const [event, setEvent] = useState(null);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await getCurrentEvent();
        if (cancelled) return;
        setEvent(data || FALLBACK_EVENT);

        if (data?.id) {
          const cats = await getEventCategories(data.id, data.id);
          if (!cancelled) setCategories(cats);
        }
      } catch {
        if (!cancelled) setEvent(FALLBACK_EVENT);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const toggleRoute = (route) => {
    setExpandedRoute(expandedRoute === route ? null : route);
  };

  const fadeUpVariant = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={32} className="spin" style={{ color: 'var(--color-primary)' }} />
        <span className="sr-only">Loading event details…</span>
      </div>
    );
  }

  const e = event;
  const countdownTarget = buildCountdownTarget(e.date, e.flag_off_time);
  const registrationOpen = e.registration_open !== false;

  // Stats band — derived from the configured categories rather than hardcoded,
  // so adding a longer route updates the homepage automatically.
  const maxDistance = categories.reduce((max, c) => Math.max(max, toNumber(c.distance)), 0);
  const maxElevation = categories.reduce((max, c) => Math.max(max, toNumber(c.elevation)), 0);

  // Built as a list and filtered, so a stat with nothing behind it is omitted
  // rather than rendered as an em dash. "Longest route" is suppressed while
  // there is only one category, where it merely repeats that category.
  const stats = [
    e.edition && { value: e.edition, label: 'Edition' },
    categories.length > 0 && {
      value: String(categories.length),
      label: categories.length === 1 ? 'Distance' : 'Distances',
    },
    categories.length > 1 && maxDistance > 0 && { value: `${maxDistance}km`, label: 'Longest Route' },
    maxElevation > 0 && { value: `${maxElevation}m`, label: 'Max Elevation' },
    { value: 'All', label: 'Levels Welcome' },
  ].filter(Boolean);

  return (
    <div>
      <Seo
        title={null}
        description={
          e.hero_subcopy || e.description ||
          `${e.name}. ${formatHeroDate(e.date)} at ${e.location}. Trail distances for every level.`
        }
        image={e.hero_image}
      />
      {/* Tells Google this page is about a dated, ticketed sporting event, so
          it can show the date and entry price directly in the result. Built
          from the live event row -- never hardcoded, or it would drift from
          what the admin panel says. */}
      <EventStructuredData event={e} categories={categories} />

      {/* Hero Section */}
      <section className="hero">
        <img src={e.hero_image || '/images/trail_hero.png'} alt="" className="hero-bg" />
        <div className="hero-overlay"></div>
        <div className="container hero-content text-center" style={{ margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <motion.span initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="badge badge-primary" style={{ marginBottom: '24px', fontSize: '1rem', padding: '8px 16px' }}>
            {e.edition ? `${e.edition} Edition` : 'Upcoming Event'}
          </motion.span>
          <motion.h1 initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', marginBottom: '16px', letterSpacing: '-2px', textTransform: 'uppercase' }}>
            <HeroHeadline text={e.hero_headline || FALLBACK_EVENT.hero_headline} />
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-muted" style={{ fontSize: '1.25rem', maxWidth: '600px', marginBottom: '40px' }}>
            {e.hero_subcopy || e.description || FALLBACK_EVENT.hero_subcopy}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto px-4 sm:px-0 justify-center">
            {registrationOpen ? (
              <Link to="/register" className="w-full sm:w-auto"><Button variant="primary" style={{ fontSize: '1.125rem', padding: '16px 40px', width: '100%' }}>Register Now</Button></Link>
            ) : (
              <Link to="/event" className="w-full sm:w-auto"><Button variant="primary" style={{ fontSize: '1.125rem', padding: '16px 40px', width: '100%' }}>View Event</Button></Link>
            )}
            <Link to="/past-events" className="w-full sm:w-auto"><Button variant="outline" style={{ fontSize: '1.125rem', padding: '16px 40px', width: '100%' }}>View Past Events</Button></Link>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass flex flex-col md:flex-row gap-8 md:gap-10 justify-center items-center w-full max-w-4xl" style={{ marginTop: '60px', padding: '24px', borderRadius: '16px' }}>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <Calendar size={24} /> <span style={{ fontWeight: 600 }}>Date</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>{formatHeroDate(e.date) || 'To be announced'}</p>
              {countdownTarget && <CountdownTimer targetDate={countdownTarget} />}
            </div>
            <div className="hidden md:block" style={{ width: '1px', alignSelf: 'stretch', background: 'rgba(255,255,255,0.1)' }}></div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <MapPin size={24} /> <span style={{ fontWeight: 600 }}>Location</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>{e.location || 'To be announced'}</p>
            </div>
            <div className="hidden md:block" style={{ width: '1px', alignSelf: 'stretch', background: 'rgba(255,255,255,0.1)' }}></div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <Users size={24} /> <span style={{ fontWeight: 600 }}>Categories</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem' }}>
                {categories.length > 0 ? `${categories.length} Distance${categories.length === 1 ? '' : 's'}` : 'Coming soon'}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="section" style={{ backgroundColor: '#050505' }}>
        <motion.div variants={fadeUpVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="container">
          <div className="stat-band">
            {stats.map(stat => (
              <div key={stat.label} className="stat-band-item">
                <span className="stat-band-value">{stat.value}</span>
                <span className="stat-band-label">{stat.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Categories */}
      <section className="section">
        <div className="container">
          <motion.div variants={fadeUpVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center" style={{ marginBottom: '60px' }}>
            <h2 style={{ fontSize: '2.5rem' }}>Upcoming <span className="accent-text">Categories</span></h2>
            <p className="text-muted" style={{ maxWidth: '600px', margin: '0 auto' }}>Choose your challenge. Whether you&apos;re a beginner or elite athlete, we have a route designed for your journey.</p>
          </motion.div>

          {categories.length === 0 ? (
            <p className="text-center text-muted">Race categories will be announced soon.</p>
          ) : (
            <div className="cat-grid">
              {categories.map((cat) => {
                const perks = Array.isArray(cat.perks) ? cat.perks : [];
                // Counted by the database, not by downloading the entrant list.
                const slotsLeft = cat.slots_left ?? (
                  cat.max_slots == null
                    ? null
                    : Math.max(cat.max_slots - (cat.registration_count || 0), 0)
                );
                const status = slotsLeft === 0 ? 'Sold Out' : (cat.status || 'Open');
                const isAvailable = registrationOpen && status === 'Open';
                const elevation = cat.elevation && cat.elevation !== '0m' ? cat.elevation : null;

                return (
                  <motion.article
                    key={cat.id}
                    className="cat-card"
                    variants={fadeUpVariant}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.2 }}
                  >
                    <header className="cat-card-head">
                      <span className="cat-card-distance">{cat.distance || cat.name}</span>
                      <span className={`cat-card-status ${status === 'Open' ? 'is-open' : 'is-closed'}`}>
                        {status}
                      </span>
                    </header>

                    <div className="cat-card-body">
                      <h3 className="cat-card-name">{cat.name}</h3>

                      {(elevation || cat.flag_off_time) && (
                        <div className="cat-card-meta">
                          {elevation && <span><TrendingUp size={14} /> {elevation} elevation</span>}
                          {cat.flag_off_time && <span><Clock size={14} /> {cat.flag_off_time}</span>}
                        </div>
                      )}

                      <div className="cat-card-price">{formatPrice(cat.price)}</div>

                      {perks.length > 0 && (
                        <ul className="cat-card-perks">
                          {perks.map((perk, pi) => (
                            <li key={pi}><Check size={15} /> <span>{perk}</span></li>
                          ))}
                        </ul>
                      )}

                      {slotsLeft !== null && slotsLeft > 0 && slotsLeft <= 10 && (
                        <p className="cat-card-scarcity">
                          Only {slotsLeft} slot{slotsLeft === 1 ? '' : 's'} left
                        </p>
                      )}

                      {cat.elevation_image && (
                        <div className="cat-card-route">
                          <button
                            type="button"
                            onClick={() => toggleRoute(cat.id)}
                            className="cat-card-route-toggle"
                            aria-expanded={expandedRoute === cat.id}
                          >
                            View elevation profile
                            {expandedRoute === cat.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                          <AnimatePresence>
                            {expandedRoute === cat.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                style={{ overflow: 'hidden' }}
                              >
                                <img
                                  src={cat.elevation_image}
                                  alt={`${cat.name} elevation profile`}
                                  className="cat-card-route-img"
                                />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>

                    <footer className="cat-card-foot">
                      {isAvailable ? (
                        <Link to="/register" style={{ display: 'block' }}>
                          <Button variant="primary" style={{ width: '100%' }}>
                            Register &middot; {formatPrice(cat.price)}
                          </Button>
                        </Link>
                      ) : (
                        <Button variant="outline" style={{ width: '100%' }} disabled>
                          {registrationOpen ? status : 'Registration Closed'}
                        </Button>
                      )}
                    </footer>
                  </motion.article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Why Join Section */}
      <section className="section" style={{ backgroundColor: '#0A0A0A', borderTop: '1px solid var(--color-border)' }}>
        <div className="container">
          <motion.div
            variants={fadeUpVariant}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="why-grid"
          >
            <div className="why-media">
              <img src="/images/trail_event2.png" alt="Runners climbing a grass ridge on the trail course" />
            </div>

            <div className="why-body">
              <h2 className="why-title">
                More Than Just A Race.<br />
                It&apos;s an <span className="accent-text">Experience.</span>
              </h2>

              <ul className="why-list">
                <li className="why-item">
                  <span className="why-icon" aria-hidden="true"><ShieldCheck size={26} /></span>
                  <div>
                    <h3>World-Class Organization</h3>
                    <p>Seamless registration, secure bag drops, and meticulously planned routes with zero traffic disruptions.</p>
                  </div>
                </li>
                <li className="why-item">
                  <span className="why-icon" aria-hidden="true"><Trophy size={26} /></span>
                  <div>
                    <h3>Premium Race Kit</h3>
                    <p>Every runner receives a high-quality Dri-FIT tee, a personalised bib, and our heavy-weight custom sculpted medal.</p>
                  </div>
                </li>
              </ul>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Each renders its own section, or nothing at all when unconfigured. */}
      <TestimonialCarousel />
      <FaqAccordion />
    </div>
  );
}
