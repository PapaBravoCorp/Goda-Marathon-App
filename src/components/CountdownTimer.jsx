import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function CountdownTimer({ targetDate }) {
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  function calculateTimeLeft() {
    const difference = +new Date(targetDate) - +new Date();
    let timeLeft = {};

    if (difference > 0) {
      timeLeft = {
        Days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        Hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        Minutes: Math.floor((difference / 1000 / 60) % 60),
        Seconds: Math.floor((difference / 1000) % 60)
      };
    } else {
      timeLeft = { Days: 0, Hours: 0, Minutes: 0, Seconds: 0 };
    }
    return timeLeft;
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearTimeout(timer);
  });

  const timerComponents = Object.keys(timeLeft).map((interval, i) => {
    return (
      <div key={interval} className="flex flex-col items-center glass" style={{ padding: '10px', borderRadius: '12px', minWidth: '70px', border: '1px solid rgba(57, 255, 20, 0.2)' }}>
        <motion.span 
          key={timeLeft[interval]}
          initial={{ y: 5, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-primary" 
          style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace' }}
        >
          {timeLeft[interval].toString().padStart(2, '0')}
        </motion.span>
        <span className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>{interval}</span>
      </div>
    );
  });

  return (
    <div className="flex gap-sm justify-center" style={{ marginTop: '16px' }}>
      {timerComponents}
    </div>
  );
}
