import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Play } from 'lucide-react';
import { AccentHeading } from './AccentHeading';
import { youTubeThumbnail, youTubeEmbedUrl } from '../utils/mediaUrl';

// YouTube's stand-in for a missing maxresdefault is 120 px wide.
const PLACEHOLDER_WIDTH = 120;

/**
 * A YouTube thumbnail, tried at `quality` first and at hqdefault (which every
 * video has) when that size does not exist. Decorative: the title is in text
 * beside it.
 */
function Thumbnail({ id, quality, className }) {
  const [current, setCurrent] = useState(quality);
  const fallBack = () => { if (current !== 'hqdefault') setCurrent('hqdefault'); };

  return (
    <img
      className={className}
      src={youTubeThumbnail(id, current)}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={(e) => { if (e.currentTarget.naturalWidth <= PLACEHOLDER_WIDTH) fallBack(); }}
      onError={fallBack}
    />
  );
}

/**
 * The large player. Until it is pressed it is only the thumbnail and a play
 * button: YouTube's player is about a megabyte of script, so it loads on
 * demand rather than with the page. Pressing play swaps in the player, which
 * streams at whatever quality the screen and connection allow, up to 4K.
 */
function Stage({ video, autoPlay }) {
  const [playing, setPlaying] = useState(autoPlay);
  const frameRef = useRef(null);
  const pressed = useRef(false);
  const portrait = video.orientation === 'portrait';

  // The play button is replaced by the player, which would drop keyboard
  // focus to the top of the page. Hand it to the player instead, where Space
  // and K pause. Not when a thumbnail started it: focus stays on that.
  useEffect(() => {
    if (playing && pressed.current) frameRef.current?.focus();
  }, [playing]);

  const play = () => {
    pressed.current = true;
    setPlaying(true);
  };

  return (
    <div className={`promo-stage ${portrait ? 'is-portrait' : 'is-landscape'}`}>
      {playing ? (
        <iframe
          ref={frameRef}
          className="promo-stage-frame"
          src={youTubeEmbedUrl(video.youtube_id, { autoplay: true })}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" className="promo-facade" onClick={play}>
          <Thumbnail id={video.youtube_id} quality="maxresdefault" className="promo-facade-img" />
          <span className="promo-play" aria-hidden="true"><Play size={30} fill="currentColor" /></span>
          <span className="sr-only">Play video: {video.title}</span>
        </button>
      )}
    </div>
  );
}

/**
 * "Watch the Trail": the promo videos from Admin -> Website, just below the
 * hero. The first is shown large; with more than one, a row of thumbnails
 * underneath switches the large one, and starts it, since choosing a video
 * means wanting to watch it. Pinned dark like the hero, so the two read as
 * one opening. Renders nothing until a video is published.
 */
export function PromoVideos({ videos, heading, intro }) {
  const reduceMotion = useReducedMotion();
  const stageRef = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  if (videos.length === 0) return null;

  const active = videos.find(v => v.id === activeId) || videos[0];

  const choose = (video) => {
    setActiveId(video.id);
    setAutoPlay(true);
    // The player changes out of sight of a screen reader user; say so.
    setAnnouncement(`Playing ${video.title}`);
    // On a phone the row sits below the player, which may be scrolled away.
    stageRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <section className="section promo-section" data-theme="dark" aria-labelledby="promo-heading">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.6 }}
        className="container"
      >
        <div className="text-center promo-head">
          <h2 id="promo-heading"><AccentHeading text={heading} /></h2>
          {intro && <p className="text-muted">{intro}</p>}
        </div>

        <div ref={stageRef} className="promo-stage-wrap">
          {/* Keyed by video, so switching starts the new one afresh. */}
          <Stage key={active.id} video={active} autoPlay={autoPlay} />
          <div className="promo-now">
            <h3 className="promo-now-title">{active.title}</h3>
            {active.caption && <p className="promo-now-caption">{active.caption}</p>}
          </div>
          <p className="sr-only" aria-live="polite">{announcement}</p>
        </div>

        {videos.length > 1 && (
          <ul className="promo-rail" aria-label="More videos">
            {videos.map(video => {
              const isActive = video.id === active.id;
              const portrait = video.orientation === 'portrait';
              return (
                <li key={video.id}>
                  <button
                    type="button"
                    className={`promo-card${isActive ? ' is-active' : ''}`}
                    onClick={() => choose(video)}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    <span className={`promo-card-thumb${portrait ? ' is-portrait' : ''}`}>
                      {/* mqdefault is a true 16:9 frame; a vertical video's
                          hqdefault is cropped to its middle instead. */}
                      <Thumbnail id={video.youtube_id} quality={portrait ? 'hqdefault' : 'mqdefault'} className="promo-card-img" />
                      <span className="promo-card-play" aria-hidden="true">
                        <Play size={14} fill="currentColor" />
                      </span>
                    </span>
                    <span className="promo-card-title">{video.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </motion.div>
    </section>
  );
}
