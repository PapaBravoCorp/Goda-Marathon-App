import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * Countdown to flag-off.
 *
 * Rewritten for three reasons:
 *
 *   * The effect had no dependency array, so it re-registered a timer on every
 *     single render -- including every render caused by its own tick.
 *   * It never reacted to `targetDate` changing. An organiser moving the race
 *     date in Settings left the homepage counting down to the old one until the
 *     visitor reloaded.
 *   * Once the date passed it sat at 00 : 00 : 00 : 00 indefinitely, which
 *     reads as broken rather than as "the race has started".
 */

function diffTo(target) {
  const ms = target - Date.now();
  if (ms <= 0) return null;
  return {
    Days: Math.floor(ms / 86400000),
    Hours: Math.floor(ms / 3600000) % 24,
    Minutes: Math.floor(ms / 60000) % 60,
    Seconds: Math.floor(ms / 1000) % 60,
  };
}

export function CountdownTimer({ targetDate }) {
  // Parsed once per date rather than on every tick.
  const target = useMemo(() => {
    const t = new Date(targetDate).getTime();
    return Number.isNaN(t) ? null : t;
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = useState(() => (target ? diffTo(target) : null));

  useEffect(() => {
    if (!target) return;

    // Recompute immediately so a changed date is reflected without waiting a
    // second, then once per second after that.
    setTimeLeft(diffTo(target));

    const id = setInterval(() => {
      const next = diffTo(target);
      setTimeLeft(next);
      // Stop the timer at zero instead of ticking forever against a past date.
      if (!next) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [target]);

  if (!target) return null;

  if (!timeLeft) {
    return (
      <p className="text-primary" style={{ marginTop: '16px', fontWeight: 700, marginBottom: 0 }}>
        Race day is here
      </p>
    );
  }

  return (
    <div
      className="flex gap-sm justify-center"
      style={{ marginTop: '16px' }}
      role="timer"
      aria-live="off"
      aria-label={`${timeLeft.Days} days, ${timeLeft.Hours} hours, ${timeLeft.Minutes} minutes until flag-off`}
    >
      {Object.entries(timeLeft).map(([unit, value]) => (
        <div
          key={unit}
          className="flex flex-col items-center glass"
          style={{ padding: '10px', borderRadius: '12px', minWidth: '70px', border: '1px solid rgba(57, 255, 20, 0.2)' }}
        >
          <motion.span
            key={value}
            initial={{ y: 5, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="text-primary"
            style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace' }}
          >
            {String(value).padStart(2, '0')}
          </motion.span>
          <span
            className="text-muted"
            style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}
            aria-hidden="true"
          >
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
