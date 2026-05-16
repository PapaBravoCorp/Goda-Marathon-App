import React, { useState, useEffect, useCallback } from 'react';
import { Camera, Video, Users, MapPin, Calendar, ChevronLeft, ChevronRight, X, ImageOff } from 'lucide-react';
import { getPastEventMedia, getAllPastEvents } from '../utils/services/media';
import './PastEvents.css';

// Static fallback data when no DB media exists
const STATIC_EVENTS = [
  {
    year: '2025',
    title: 'Goda Epic Trail - 2nd Edition',
    participants: '1000+',
    location: 'Gangapur Backwaters, Nagalwadi, Girnare',
    date: 'October 5, 2025',
    description: 'An epic trail run experience that connected runners with nature through lush trails and rolling hills.',
  }
];

const STATIC_IMAGES = [
  { url: '/images/trail_hero.png', caption: 'The starting line at dawn' },
  { url: '/images/trail_event1.png', caption: 'Runners on the scenic trail' },
  { url: '/images/trail_event2.png', caption: 'The finish line celebrations' },
  { url: '/images/event1.png', caption: 'Community spirit on display' },
  { url: '/images/event2.png', caption: 'Post-race celebrations' },
  { url: '/images/hero.png', caption: 'The trail awaits' },
];

function getYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function Lightbox({ images, currentIndex, onClose, onNext, onPrev }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, onNext, onPrev]);

  const current = images[currentIndex];
  if (!current) return null;

  return (
    <div className="pe-lightbox" onClick={onClose}>
      <div className="pe-lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="pe-lightbox-close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        {images.length > 1 && (
          <>
            <button className="pe-lightbox-nav pe-lightbox-prev" onClick={onPrev} aria-label="Previous">
              <ChevronLeft size={24} />
            </button>
            <button className="pe-lightbox-nav pe-lightbox-next" onClick={onNext} aria-label="Next">
              <ChevronRight size={24} />
            </button>
          </>
        )}

        <img src={current.url} alt={current.caption || 'Gallery image'} />

        {current.caption && (
          <div className="pe-lightbox-caption">{current.caption}</div>
        )}
      </div>
    </div>
  );
}

export default function PastEvents() {
  const [dbEvents, setDbEvents] = useState([]);
  const [dbMedia, setDbMedia] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const events = await getAllPastEvents();
      setDbEvents(events);

      if (events.length > 0) {
        setSelectedYear(events[0].year);
        const media = await getPastEventMedia(events[0].year);
        setDbMedia(media);
      } else {
        // Use static fallback
        setSelectedYear('2025');
      }
    } catch (error) {
      console.error('Error loading past events:', error);
      setSelectedYear('2025');
    } finally {
      setIsLoading(false);
    }
  };

  const handleYearChange = async (year) => {
    setSelectedYear(year);
    if (dbEvents.length > 0) {
      const media = await getPastEventMedia(year);
      setDbMedia(media);
    }
  };

  const hasDbMedia = dbEvents.length > 0 && dbMedia.length > 0;
  const images = hasDbMedia
    ? dbMedia.filter(m => m.media_type === 'image')
    : STATIC_IMAGES.map((img, i) => ({ ...img, id: `static-${i}`, media_type: 'image' }));
  const videos = hasDbMedia
    ? dbMedia.filter(m => m.media_type === 'video')
    : [];

  const allYears = dbEvents.length > 0
    ? dbEvents.map(e => e.year)
    : STATIC_EVENTS.map(e => e.year);

  const currentEventInfo = dbEvents.find(e => e.year === selectedYear)
    || STATIC_EVENTS.find(e => e.year === selectedYear);

  const staticInfo = STATIC_EVENTS.find(e => e.year === selectedYear);

  const openLightbox = useCallback((index) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const nextImage = useCallback(() => {
    setLightboxIndex(prev => (prev + 1) % images.length);
  }, [images.length]);

  const prevImage = useCallback(() => {
    setLightboxIndex(prev => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  return (
    <div className="past-events-page">
      {/* Cinematic Hero */}
      <div className="pe-hero">
        <div className="pe-hero-bg" />
        <div className="pe-hero-overlay" />
        <div className="pe-hero-content">
          <div className="pe-hero-badge">
            <Camera size={14} />
            Memories & Moments
          </div>
          <h1 className="pe-hero-title">
            Our <span className="accent-text">Legacy</span>
          </h1>
          <p className="pe-hero-subtitle">
            Relive the incredible moments, broken records, and unyielding spirit of our past marathons through photos and videos.
          </p>
        </div>
      </div>

      {/* Year Navigation */}
      {allYears.length > 0 && (
        <div className="pe-year-nav">
          {allYears.map(year => (
            <button
              key={year}
              className={`pe-year-pill ${selectedYear === year ? 'active' : ''}`}
              onClick={() => handleYearChange(year)}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {/* Event Content */}
      <div className="container">
        <div className="pe-event-section pe-fade-in" key={selectedYear}>
          {/* Event Header */}
          <div className="pe-event-header">
            <h2 className="pe-event-title">
              {currentEventInfo?.title || `GODA Marathon ${selectedYear}`}
            </h2>
            {staticInfo && (
              <div className="pe-event-stats">
                {staticInfo.participants && (
                  <div className="pe-stat">
                    <Users size={18} />
                    <span>{staticInfo.participants} Finishers</span>
                  </div>
                )}
                {staticInfo.location && (
                  <div className="pe-stat">
                    <MapPin size={18} />
                    <span>{staticInfo.location}</span>
                  </div>
                )}
                {staticInfo.date && (
                  <div className="pe-stat">
                    <Calendar size={18} />
                    <span>{staticInfo.date}</span>
                  </div>
                )}
              </div>
            )}
            {staticInfo?.description && (
              <p className="text-muted" style={{ maxWidth: '650px', margin: '1.5rem auto 0', fontSize: '1rem', lineHeight: 1.7 }}>
                {staticInfo.description}
              </p>
            )}
          </div>

          {/* Photo Gallery */}
          {images.length > 0 && (
            <>
              <h3 className="pe-section-title"><Camera size={22} /> Photo Gallery</h3>
              <div className="pe-gallery">
                {images.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="pe-gallery-item"
                    onClick={() => openLightbox(index)}
                  >
                    <img
                      src={item.url}
                      alt={item.caption || `Event photo ${index + 1}`}
                      loading="lazy"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    {item.caption && (
                      <div className="pe-gallery-caption">{item.caption}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Videos */}
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
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : (
                          <video controls preload="metadata">
                            <source src={vid.url} />
                          </video>
                        )}
                      </div>
                      {vid.caption && (
                        <div className="pe-video-caption">{vid.caption}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Empty State */}
          {images.length === 0 && videos.length === 0 && !isLoading && (
            <div className="pe-empty-state">
              <ImageOff size={48} />
              <p>No media has been added for this event yet.</p>
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>Check back soon for photos and videos!</p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
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
