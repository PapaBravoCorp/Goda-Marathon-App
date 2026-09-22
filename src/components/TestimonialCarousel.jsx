import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { getPublishedTestimonials } from '../utils/services/content';

/** Initials stand in for a missing photo — better than an empty grey disc. */
function initialsOf(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');
}

export function TestimonialCarousel() {
  const [testimonials, setTestimonials] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPublishedTestimonials()
      .then(rows => { if (!cancelled) setTestimonials(rows); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Renders nothing at all when there is nothing genuine to show, so the
  // landing page never displays placeholder praise.
  if (isLoading || testimonials.length === 0) return null;

  const total = testimonials.length;
  const current = testimonials[Math.min(currentIndex, total - 1)];
  const next = () => setCurrentIndex(i => (i + 1) % total);
  const prev = () => setCurrentIndex(i => (i - 1 + total) % total);

  return (
    <section className="section">
      <div className="container">
        <h2 className="text-center" style={{ fontSize: '2.5rem', marginBottom: '60px' }}>
          Join Our <span className="accent-text">Community</span>
        </h2>

        <div className="testimonial-carousel">
          <AnimatePresence mode="wait">
            <motion.figure
              key={current.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.3 }}
              className="glass testimonial-card"
            >
              {current.rating > 0 && (
                <div className="testimonial-stars" aria-label={`${current.rating} out of 5 stars`}>
                  {Array.from({ length: current.rating }).map((_, i) => (
                    <Star key={i} size={20} fill="currentColor" aria-hidden="true" />
                  ))}
                </div>
              )}

              <blockquote className="testimonial-quote">{current.quote}</blockquote>

              <figcaption className="testimonial-author">
                <span className="testimonial-avatar" aria-hidden="true">
                  {current.avatar_image
                    ? <img src={current.avatar_image} alt="" />
                    : initialsOf(current.author_name)}
                </span>
                <span className="testimonial-author-text">
                  <span className="testimonial-author-name">{current.author_name}</span>
                  {current.author_role && (
                    <span className="testimonial-author-role">{current.author_role}</span>
                  )}
                </span>
              </figcaption>
            </motion.figure>
          </AnimatePresence>

          {total > 1 && (
            <div className="testimonial-nav">
              <button
                type="button"
                onClick={prev}
                className="testimonial-nav-btn"
                aria-label="Previous testimonial"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="testimonial-counter">{currentIndex + 1} / {total}</span>
              <button
                type="button"
                onClick={next}
                className="testimonial-nav-btn"
                aria-label="Next testimonial"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
