import React, { useState, useRef, useLayoutEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { resolveImageUrl } from '../utils/mediaUrl';

// Scroll speed of the logo strip. Constant speed rather than constant
// duration, so adding sponsors does not make the strip race.
const STRIP_PX_PER_SECOND = 40;
const STRIP_GAP_PX = 20;

const DEFAULT_LABEL = 'In association with';

/** The DB constraint already requires http(s); this keeps any other scheme out of an href. */
function safeHref(url) {
  return /^https?:\/\//i.test(url || '') ? url : null;
}

/**
 * One logo on its tile. Linked when the sponsor has a website. `decorative`
 * is for the strip's second copy, which exists only to make the loop seamless
 * and is hidden from screen readers and the tab order.
 */
function SponsorLogo({ sponsor, size = 'md', decorative = false }) {
  const href = safeHref(sponsor.website_url);
  const tone = sponsor.logo_background === 'dark' ? 'dark' : 'light';
  const className = `sponsor-logo sponsor-logo--${size} is-${tone}`;

  const img = (
    <img
      src={resolveImageUrl(sponsor.logo_url)}
      alt={decorative ? '' : sponsor.name}
      loading={size === 'hero' ? 'eager' : 'lazy'}
      decoding="async"
      draggable="false"
    />
  );

  if (!href) return <span className={className} title={sponsor.name}>{img}</span>;

  return (
    <a
      href={href}
      className={className}
      title={sponsor.name}
      target="_blank"
      // "sponsored" is how search engines ask paid links to be marked.
      rel="sponsored noopener noreferrer"
      tabIndex={decorative ? -1 : undefined}
    >
      {img}
      {!decorative && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  );
}

/**
 * Featured partners' logos across the top of the hero, laid out like the
 * event poster: the label ("An Initiative By") above, then the logos side by
 * side, split by a thin rule.
 *
 * A logo whose tile is set to Dark is artwork made for dark backgrounds, so it
 * sits straight on the photograph, as on the poster. One set to Light has
 * dark lettering that would vanish there, so it keeps a white tile.
 */
export function HeroPartners({ sponsors }) {
  const featured = sponsors.filter(s => s.is_featured);
  if (featured.length === 0) return null;

  const labels = [...new Set(featured.map(s => s.label || DEFAULT_LABEL))];
  // One shared caption reads as the poster does; differing labels go on
  // their own logos instead.
  const shared = labels.length === 1 ? labels[0] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="hero-partners"
    >
      {shared && <p className="hero-partners-label" aria-hidden="true">{shared}</p>}
      <ul className="hero-partners-logos" aria-label={shared || 'Event partners'}>
        {featured.map(s => (
          <li key={s.id} className="hero-partner">
            {shared ? <SponsorLogo sponsor={s} size="hero" /> : (
              <span className="hero-partner-stack">
                <span className="hero-partners-label">{s.label || DEFAULT_LABEL}</span>
                <SponsorLogo sponsor={s} size="hero" />
              </span>
            )}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/**
 * A row of logos that scrolls continuously once there are more than fit.
 *
 * While they fit, the row stands still and centred: a marquee of three logos
 * chasing each other across a wide screen looks broken. When it does scroll,
 * the list is rendered twice and the pair is shifted by exactly one copy, so
 * the loop has no visible seam. It pauses on hover and focus, and has a pause
 * button, since moving content must be stoppable (WCAG 2.2.2). With reduced
 * motion requested it never animates; an overflowing row scrolls by hand.
 */
function LogoStrip({ sponsors }) {
  const viewportRef = useRef(null);
  const listRef = useRef(null);
  const [listWidth, setListWidth] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return undefined;

    // Tiles are fixed-size, so this does not wait on the images loading.
    const measure = () => {
      setListWidth(list.offsetWidth);
      setOverflows(list.offsetWidth > viewport.clientWidth + 1);
    };
    measure();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(list);
    return () => observer.disconnect();
  }, [sponsors]);

  const animate = overflows && !reduceMotion;
  const duration = (listWidth + STRIP_GAP_PX) / STRIP_PX_PER_SECOND;

  const classes = [
    'sponsor-strip',
    animate && 'is-animated',
    animate && paused && 'is-paused',
    overflows && !animate && 'is-scrollable',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={{ '--strip-gap': `${STRIP_GAP_PX}px` }}>
      <div className="sponsor-strip-viewport" ref={viewportRef}>
        <div className="sponsor-strip-track" style={animate ? { '--strip-duration': `${duration}s` } : undefined}>
          <ul className="sponsor-strip-list" ref={listRef}>
            {sponsors.map(s => <li key={s.id}><SponsorLogo sponsor={s} /></li>)}
          </ul>
          {animate && (
            <ul className="sponsor-strip-list" aria-hidden="true">
              {sponsors.map(s => <li key={s.id}><SponsorLogo sponsor={s} decorative /></li>)}
            </ul>
          )}
        </div>
      </div>

      {animate && (
        <button
          type="button"
          className="sponsor-strip-toggle"
          onClick={() => setPaused(p => !p)}
          aria-label={paused ? 'Resume scrolling sponsor logos' : 'Pause scrolling sponsor logos'}
        >
          {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

/**
 * The homepage sponsors section: featured partners first, on larger tiles
 * with their label, then everyone else in the scrolling strip. Renders nothing
 * when no sponsor is published.
 */
export function SponsorsSection({ sponsors, edition }) {
  if (sponsors.length === 0) return null;

  const featured = sponsors.filter(s => s.is_featured);
  const others = sponsors.filter(s => !s.is_featured);

  return (
    <section
      className="section sponsors-section"
      aria-labelledby="sponsors-heading"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="container">
          <div className="text-center sponsors-head">
            <h2 id="sponsors-heading" style={{ fontSize: '2.5rem' }}>
              Our <span className="accent-text">Partners</span>
            </h2>
            <p className="text-muted">
              The organisations behind the {edition ? `${edition} edition` : 'race'}.
            </p>
          </div>

          {featured.length > 0 && (
            <ul className="sponsors-featured">
              {featured.map(s => (
                <li key={s.id} className="sponsors-featured-item">
                  <span className="sponsors-eyebrow">{s.label || DEFAULT_LABEL}</span>
                  <SponsorLogo sponsor={s} size="lg" />
                </li>
              ))}
            </ul>
          )}

          {featured.length > 0 && others.length > 0 && (
            <p className="sponsors-eyebrow sponsors-strip-caption">Supported by</p>
          )}
        </div>

        {others.length > 0 && <LogoStrip sponsors={others} />}
      </motion.div>
    </section>
  );
}
