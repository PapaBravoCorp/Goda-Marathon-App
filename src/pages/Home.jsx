import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Calendar, MapPin, Mountain, Users, ChevronDown, ChevronUp, Loader, Check, Clock, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import Seo from '../components/Seo';
import EventStructuredData from '../components/EventStructuredData';
import { CountdownTimer } from '../components/CountdownTimer';
import { TestimonialCarousel } from '../components/TestimonialCarousel';
import { FaqAccordion } from '../components/FaqAccordion';
import { HeroImage } from '../components/HeroImage';
import { HeroVideo } from '../components/HeroVideo';
import { HeroHeadline, DEFAULT_HERO_HEADLINE } from '../components/HeroHeadline';
import { HeroPartners, SponsorsSection } from '../components/Sponsors';
import { StorySoFar } from '../components/StorySoFar';
import { Highlights } from '../components/Highlights';
import { FirstTimerGuide } from '../components/FirstTimerGuide';

import { getCurrentEvent } from '../utils/services/events';
import { getEventCategories } from '../utils/services/categories';
import { getPublishedSponsors } from '../utils/services/sponsors';
import { getPublishedPastEvents } from '../utils/services/pastEvents';
import { getPublishedHomepageBlocks } from '../utils/services/homepageBlocks';
import { levelLabel } from '../utils/categoryLevels';
import { CURRENT_EVENT } from '../utils/constants';
import { formatHeroDate, buildCountdownTarget } from '../utils/dates';

// Used only when the DB is unreachable or holds no current event, so the
// landing page degrades to the previous static content instead of blanking.
const FALLBACK_EVENT = {
  name: CURRENT_EVENT.name,
  edition: '3rd',
  date: '2026-08-09',
  flag_off_time: '06:45 AM',
  location: 'Girnare, Nashik',
  hero_image: '/images/trail_hero.png',
  hero_headline: DEFAULT_HERO_HEADLINE,
  hero_subcopy: 'Push past your limits at the Goda Epic Trail Run 2026. Join us for the ultimate test of endurance, spirit, and connection with nature in the scenic Gangapur Backwaters.',
  registration_open: true,
};

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

/** A category distance in km: "15km" → 15, "300m" → 0.3. Unreadable text is 0. */
function toKm(value) {
  const text = String(value ?? '').toLowerCase();
  const n = toNumber(text);
  return /\d\s*m\b/.test(text) && !text.includes('km') ? n / 1000 : n;
}

/** [3, 5, 21] → "3–21 km"; null when no distance could be read. */
function describeDistanceRange(distancesKm) {
  if (distancesKm.length === 0) return null;
  const fmt = (n) => String(Number(n.toFixed(1)));
  const min = Math.min(...distancesKm);
  const max = Math.max(...distancesKm);
  return min === max ? `${fmt(max)} km` : `${fmt(min)}–${fmt(max)} km`;
}

// At or below this many places, the card's badge turns orange.
const LOW_SLOTS = 10;

/**
 * The badge in a category card's header: places left while the category has a
 * cap and is taking entries, otherwise its status. The count is the
 * database's own, unrounded: it is the limit registration will enforce, and a
 * lower figure would be a false claim. To show a smaller number, release
 * places in waves by lowering the category's max slots.
 */
function categoryBadge(status, slotsLeft, registrationOpen) {
  if (!registrationOpen) return { text: 'Closed', tone: 'is-closed' };
  if (status !== 'Open') return { text: status, tone: 'is-closed' };
  if (slotsLeft === null) return { text: 'Open', tone: 'is-open' };
  return {
    text: `${slotsLeft} slot${slotsLeft === 1 ? '' : 's'} left`,
    tone: slotsLeft <= LOW_SLOTS ? 'is-low' : 'is-open',
  };
}

export default function Home() {
  const [expandedRoute, setExpandedRoute] = useState(null);
  const [event, setEvent] = useState(null);
  const [categories, setCategories] = useState([]);
  const [sponsors, setSponsors] = useState([]);
  const [pastEditions, setPastEditions] = useState([]);
  const [blocks, setBlocks] = useState({ story: [], usp: [], tip: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Requested alongside the event rather than after it, and awaited before
      // the first paint so a featured partner's hero credit does not pop in
      // and push the page down. Past editions and the homepage copy blocks are
      // held back for the same reason: they sit above the categories, and
      // arriving late they would shove them away from a visitor who had
      // already scrolled there. None of these rejects: a failure is empty.
      const sponsorsRequest = getPublishedSponsors();
      const pastEditionsRequest = getPublishedPastEvents();
      const blocksRequest = getPublishedHomepageBlocks();

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
      }

      const [sponsorRows, editionRows, blockGroups] = await Promise.all([
        sponsorsRequest, pastEditionsRequest, blocksRequest,
      ]);
      if (cancelled) return;
      setSponsors(sponsorRows);
      setPastEditions(editionRows);
      setBlocks(blockGroups);
      setIsLoading(false);
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
        <Loader size={32} className="spin" style={{ color: 'var(--color-primary-text)' }} />
        <span className="sr-only">Loading event details…</span>
      </div>
    );
  }

  const e = event;
  const countdownTarget = buildCountdownTarget(e.date, e.flag_off_time);
  const registrationOpen = e.registration_open !== false;

  // The hero's distances fact, derived from the configured categories rather
  // than hardcoded, so adding a longer route updates the homepage. This used
  // to be a separate stats band, which repeated the edition and the number of
  // distances already shown above it.
  const routeCount = categories.length > 0
    ? `${categories.length} route${categories.length === 1 ? '' : 's'}`
    : null;
  const distanceRange = describeDistanceRange(
    categories.map(c => toKm(c.distance)).filter(n => n > 0),
  );
  const maxElevation = categories.reduce((max, c) => Math.max(max, toNumber(c.elevation)), 0);
  const distanceDetail = [
    distanceRange && routeCount,
    maxElevation > 0 && `up to ${maxElevation}m elevation`,
  ].filter(Boolean).join(' · ');

  // The first-timer guide renders when there is a beginner distance or a tip
  // to show, and the hero's second button points at it when it does.
  const starters = categories.filter(c => c.level === 'beginner');
  const hasFirstTimerGuide = starters.length > 0 || blocks.tip.length > 0;

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
      <section className="hero hero--home" data-theme="dark">
        {/* Drawn at ~130vw on phones: the photo band there is shallower than
            the screen is wide, and cover scales the photo to its height. */}
        <HeroImage src={e.hero_image} className="hero-bg" sizes="(max-width: 767px) 130vw, 100vw" />
        {/* Over the photo, which stays as its poster and fallback. */}
        <HeroVideo src={e.hero_video} className="hero-bg" />
        <div className="hero-overlay"></div>
        <div className="container hero-content text-center" style={{ margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Partner logos head the hero, as they head the event poster. */}
          <HeroPartners sponsors={sponsors} />
          <motion.span initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="badge badge-primary hero-badge">
            {e.edition ? `${e.edition} Edition` : 'Upcoming Event'}
          </motion.span>
          <motion.h1 initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="hero-title">
            <HeroHeadline text={e.hero_headline || FALLBACK_EVENT.hero_headline} />
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-muted hero-subcopy">
            {e.hero_subcopy || e.description || FALLBACK_EVENT.hero_subcopy}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto px-4 sm:px-0 justify-center">
            {registrationOpen ? (
              <Link to="/register" className="w-full sm:w-auto"><Button variant="primary" style={{ fontSize: '1.125rem', padding: '16px 40px', width: '100%' }}>Register Now</Button></Link>
            ) : (
              <Link to="/event" className="w-full sm:w-auto"><Button variant="primary" style={{ fontSize: '1.125rem', padding: '16px 40px', width: '100%' }}>View Event</Button></Link>
            )}
            {/* Past editions are on this page now (the timeline below), so the
                second slot goes to first-timers, or to the distances while
                there is no guide to send them to. */}
            <Link to={hasFirstTimerGuide ? '/#first-timers' : '/#categories'} className="w-full sm:w-auto">
              <Button variant="outline" style={{ fontSize: '1.125rem', padding: '16px 40px', width: '100%' }}>
                {hasFirstTimerGuide ? 'New to Trails? Start Here' : 'Find Your Distance'}
              </Button>
            </Link>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass flex flex-col md:flex-row gap-8 md:gap-10 justify-center items-center w-full max-w-4xl" style={{ marginTop: '60px', padding: '24px', borderRadius: '16px' }}>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <Calendar size={24} /> <span style={{ fontWeight: 600 }}>Date</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>{formatHeroDate(e.date) || 'To be announced'}</p>
              {countdownTarget && <CountdownTimer targetDate={countdownTarget} />}
            </div>
            <div className="hidden md:block" style={{ width: '1px', alignSelf: 'stretch', background: 'rgba(var(--color-fg-rgb), 0.1)' }}></div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <MapPin size={24} /> <span style={{ fontWeight: 600 }}>Location</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>{e.location || 'To be announced'}</p>
            </div>
            <div className="hidden md:block" style={{ width: '1px', alignSelf: 'stretch', background: 'rgba(var(--color-fg-rgb), 0.1)' }}></div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <Mountain size={24} /> <span style={{ fontWeight: 600 }}>Distances</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase', margin: 0 }}>
                {distanceRange || routeCount || 'Coming soon'}
              </p>
              {distanceDetail && (
                <p className="text-muted" style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>{distanceDetail}</p>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Past editions leading up to this one. Renders nothing until one is published. */}
      <StorySoFar story={blocks.story} editions={pastEditions} event={e} registrationOpen={registrationOpen} />

      {/* "What makes it different". Renders nothing until a point is published. */}
      <Highlights items={blocks.usp} />

      {/* Categories */}
      <section id="categories" className="section section--alt">
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
                const badge = categoryBadge(status, slotsLeft, registrationOpen);
                const elevation = cat.elevation && cat.elevation !== '0m' ? cat.elevation : null;
                const level = levelLabel(cat.level);

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
                      <span className={`cat-card-status ${badge.tone}`}>
                        {badge.text}
                      </span>
                    </header>

                    <div className="cat-card-body">
                      {level && <span className={`cat-card-level is-${cat.level}`}>{level}</span>}
                      <h3 className="cat-card-name">{cat.name}</h3>
                      {cat.audience && <p className="cat-card-audience">{cat.audience}</p>}

                      {(elevation || cat.flag_off_time || cat.min_age) && (
                        <div className="cat-card-meta">
                          {elevation && <span><TrendingUp size={14} /> {elevation} elevation</span>}
                          {cat.flag_off_time && <span><Clock size={14} /> {cat.flag_off_time}</span>}
                          {cat.min_age && <span><Users size={14} /> Ages {cat.min_age}+</span>}
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

      {/* Starter distances and tips. Renders nothing when there are neither. */}
      <FirstTimerGuide tips={blocks.tip} starters={starters} />

      {/* Each renders its own section, or nothing at all when unconfigured. */}
      <SponsorsSection sponsors={sponsors} edition={e.edition} />
      <TestimonialCarousel />
      <FaqAccordion />
    </div>
  );
}
