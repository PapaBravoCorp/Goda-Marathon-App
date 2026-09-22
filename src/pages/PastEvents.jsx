import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, Video, Users, MapPin, Calendar, ChevronLeft, ChevronRight, X, ImageOff } from 'lucide-react';
import { getPastEventMedia } from '../utils/services/media';
import { getPublishedPastEvents } from '../utils/services/pastEvents';
import { resolveImageUrl, getYouTubeId } from '../utils/mediaUrl';
import { formatDisplayDate } from '../utils/dates';
import Seo from '../components/Seo';
import './PastEvents.css';

// Shown only when no published edition exists in the DB, so the page never
// renders empty for a first-time visitor.
const FALLBACK_EVENT = {
  id: 'fallback-event',
  year: '2025',
  title: 'Goda Epic Trail - 2nd Edition',
  participants: '1000+',
  location: 'Gangapur Backwaters, Nagalwadi, Girnare',
  event_date: 'October 5, 2025',
  description: 'An epic trail run experience that connected runners with nature through lush trails and rolling hills.',
};

const FALLBACK_IMAGES = [
  { url: '/images/trail_hero.png', caption: 'The starting line at dawn' },
  { url: '/images/trail_event1.png', caption: 'Runners on the scenic trail' },
  { url: '/images/trail_event2.png', caption: 'The finish line celebrations' },
  { url: '/images/event1.png', caption: 'Community spirit on display' },
  { url: '/images/event2.png', caption: 'Post-race celebrations' },
  { url: '/images/hero.png', caption: 'The trail awaits' },
].map((img, i) => ({ ...img, id: `fallback-${i}`, media_type: 'image' }));

function Lightbox({ images, currentIndex, onClose, onNext, onPrev }) {
  const closeRef = useRef(null);

  // Mount only: lock the page behind and take focus. Keeping this free of
  // callback dependencies means a re-created handler can never steal focus back
  // while the viewer is open.
  useEffect(() => {
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, onNext, onPrev]);

  const current = images[currentIndex];
  if (!current) return null;

  return (
    <div className="pe-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div className="pe-lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} className="pe-lightbox-close" onClick={onClose} aria-label="Close viewer">
          <X size={20} />
        </button>

        {images.length > 1 && (
          <>
            <button className="pe-lightbox-nav pe-lightbox-prev" onClick={onPrev} aria-label="Previous photo">
              <ChevronLeft size={24} />
            </button>
            <button className="pe-lightbox-nav pe-lightbox-next" onClick={onNext} aria-label="Next photo">
              <ChevronRight size={24} />
            </button>
          </>
        )}

        <img src={resolveImageUrl(current.url, 1600)} alt={current.caption || 'Event photograph'} />

        <div className="pe-lightbox-caption">
          {current.caption && <span>{current.caption}</span>}
          <span className="pe-lightbox-count">{currentIndex + 1} of {images.length}</span>
        </div>
      </div>
    </div>
  );
}

/** Gallery tile — a real button, so it is reachable by keyboard. */
function GalleryItem({ item, index, onOpen }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) return null;

  return (
    <button
      type="button"
      className="pe-gallery-item"
      onClick={() => onOpen(index)}
      aria-label={item.caption ? `View photo: ${item.caption}` : `View photo ${index + 1}`}
    >
      {!loaded && <span className="pe-gallery-skeleton" aria-hidden="true" />}
      <img
        src={resolveImageUrl(item.url, 800)}
        alt={item.caption || `Event photo ${index + 1}`}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{ opacity: loaded ? 1 : 0 }}
      />
      {item.caption && <span className="pe-gallery-caption">{item.caption}</span>}
    </button>
  );
}

export default function PastEvents() {
  const [events, setEvents] = useState([]);
  const [media, setMedia] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const rows = await getPublishedPastEvents();
        if (cancelled) return;

        const list = rows.length > 0 ? rows : [FALLBACK_EVENT];
        setEvents(list);
        setSelectedId(list[0].id);

        if (rows.length > 0) {
          const m = await getPastEventMedia(list[0].id);
          if (!cancelled) setMedia(m);
        }
      } catch (error) {
        console.error('Error loading past events:', error);
        if (!cancelled) {
          setEvents([FALLBACK_EVENT]);
          setSelectedId(FALLBACK_EVENT.id);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleEditionChange = async (id) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setIsLoadingMedia(true);
    try {
      setMedia(await getPastEventMedia(id));
    } finally {
      setIsLoadingMedia(false);
    }
  };

  const currentEvent = events.find(e => e.id === selectedId) || events[0] || FALLBACK_EVENT;

  /**
   * Pill text. Several editions can share a year, so fall back to the label —
   * and then to the title — rather than rendering two identical "2025" buttons.
   */
  const editionLabel = (ev) => {
    const sharesYear = events.filter(e => e.year === ev.year).length > 1;
    if (!sharesYear) return ev.year;
    if (ev.edition_label) return `${ev.year} · ${ev.edition_label}`;
    return ev.title || ev.year;
  };

  const usingFallbackMedia = media.length === 0 && events.length === 1 && events[0] === FALLBACK_EVENT;
  const images = usingFallbackMedia ? FALLBACK_IMAGES : media.filter(m => m.media_type === 'image');
  const videos = usingFallbackMedia ? [] : media.filter(m => m.media_type === 'video');

  const openLightbox = useCallback((index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const nextImage = useCallback(() => setLightboxIndex(p => (p + 1) % images.length), [images.length]);
  const prevImage = useCallback(() => setLightboxIndex(p => (p - 1 + images.length) % images.length), [images.length]);

  const heroStyle = currentEvent.cover_image
    ? { backgroundImage: `url(${resolveImageUrl(currentEvent.cover_image, 1600)})` }
    : undefined;

  return (
    <div className="past-events-page">
      <Seo
        title="Past Events"
        description="Photos and video from previous editions of the GODA Epic Trail Run in the Gangapur Backwaters near Nashik."
        image={currentEvent.cover_image}
      />
      <div className="pe-hero">
        <div className="pe-hero-bg" style={heroStyle} />
        <div className="pe-hero-overlay" />
        <div className="pe-hero-content">
          <div className="pe-hero-badge">
            <Camera size={14} />
            Memories &amp; Moments
          </div>
          <h1 className="pe-hero-title">
            Our <span className="accent-text">Legacy</span>
          </h1>
          <p className="pe-hero-subtitle">
            Relive the incredible moments, broken records, and unyielding spirit of our past marathons
            through photos and videos.
          </p>
        </div>
      </div>

      {events.length > 1 && (
        <nav className="pe-year-nav" aria-label="Select edition">
          {events.map(ev => (
            <button
              key={ev.id}
              className={`pe-year-pill ${selectedId === ev.id ? 'active' : ''}`}
              onClick={() => handleEditionChange(ev.id)}
              aria-current={selectedId === ev.id ? 'true' : undefined}
            >
              {editionLabel(ev)}
            </button>
          ))}
        </nav>
      )}

      <div className="container">
        <div className="pe-event-section pe-fade-in" key={selectedId}>
          <div className="pe-event-header">
            <h2 className="pe-event-title">
              {currentEvent.title || `GODA Marathon ${currentEvent.year}`}
            </h2>

            {(currentEvent.participants || currentEvent.location || currentEvent.event_date) && (
              <div className="pe-event-stats">
                {currentEvent.participants && (
                  <div className="pe-stat">
                    <Users size={18} />
                    <span>{currentEvent.participants} Finishers</span>
                  </div>
                )}
                {currentEvent.location && (
                  <div className="pe-stat">
                    <MapPin size={18} />
                    <span>{currentEvent.location}</span>
                  </div>
                )}
                {currentEvent.event_date && (
                  <div className="pe-stat">
                    <Calendar size={18} />
                    <span>{formatDisplayDate(currentEvent.event_date)}</span>
                  </div>
                )}
              </div>
            )}

            {currentEvent.description && (
              <p className="pe-event-description text-muted">{currentEvent.description}</p>
            )}
          </div>

          {isLoading || isLoadingMedia ? (
            <div className="pe-gallery" aria-busy="true" aria-label="Loading gallery">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="pe-gallery-item pe-gallery-item--skeleton" />
              ))}
            </div>
          ) : (
            <>
              {images.length > 0 && (
                <>
                  <h3 className="pe-section-title"><Camera size={22} /> Photo Gallery</h3>
                  <div className="pe-gallery">
                    {images.map((item, index) => (
                      <GalleryItem
                        key={item.id || index}
                        item={item}
                        index={index}
                        onOpen={openLightbox}
                      />
                    ))}
                  </div>
                </>
              )}

              {videos.length > 0 && (
                <>
                  <h3 className="pe-section-title"><Video size={22} /> Event Videos</h3>
                  <div className="pe-videos-grid">
                    {videos.map((vid) => {
                      const ytId = getYouTubeId(vid.url);
                      return (
                        <div key={vid.id} className="pe-video-card">
                          <div className="pe-video-wrapper">
                            {ytId ? (
                              <iframe
                                src={`https://www.youtube.com/embed/${ytId}`}
                                title={vid.caption || 'Event video'}
                                loading="lazy"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            ) : (
                              <video controls preload="metadata">
                                <source src={vid.url} />
                              </video>
                            )}
                          </div>
                          {vid.caption && <div className="pe-video-caption">{vid.caption}</div>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {images.length === 0 && videos.length === 0 && (
                <div className="pe-empty-state">
                  <ImageOff size={48} />
                  <p>No media has been added for this event yet.</p>
                  <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                    Check back soon for photos and videos!
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {lightboxOpen && images.length > 0 && (
        <Lightbox
          images={images}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={nextImage}
          onPrev={prevImage}
        />
      )}
    </div>
  );
}
