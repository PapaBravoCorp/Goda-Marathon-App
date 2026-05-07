import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';

const TESTIMONIALS = [
  {
    id: 1,
    text: "The energy at the starting line was absolute electric. Best organized marathon I've ever ran. Will definitely be returning next year to beat my PR.",
    name: "Alex Johnson",
    subtitle: "2-Time Marathon Finisher"
  },
  {
    id: 2,
    text: "Pristine trails, excellent aid stations, and the community is just so welcoming. Reaching the peak of the 15km was visually stunning.",
    name: "Maria Garcia",
    subtitle: "Trail Runner Enthusiast"
  },
  {
    id: 3,
    text: "As a beginner, the 5km route was perfect. The organization was top-notch, and receiving the custom medal felt like a true achievement.",
    name: "Rahul Verma",
    subtitle: "First-time Runner"
  }
];

export function TestimonialCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextSlide = () => {
    setCurrentIndex((prevIndex) => (prevIndex === TESTIMONIALS.length - 1 ? 0 : prevIndex + 1));
  };

  const prevSlide = () => {
    setCurrentIndex((prevIndex) => (prevIndex === 0 ? TESTIMONIALS.length - 1 : prevIndex - 1));
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '800px', margin: '0 auto', overflow: 'hidden', paddingBottom: '60px' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
          className="glass"
          style={{ padding: '40px', borderRadius: '16px', textAlign: 'center' }}
        >
          <div className="flex gap-sm justify-center text-primary" style={{ marginBottom: '24px' }}>
            <Star size={24} fill="#39FF14" />
            <Star size={24} fill="#39FF14" />
            <Star size={24} fill="#39FF14" />
            <Star size={24} fill="#39FF14" />
            <Star size={24} fill="#39FF14" />
          </div>
          <p style={{ fontSize: '1.25rem', fontStyle: 'italic', marginBottom: '32px' }}>
            "{TESTIMONIALS[currentIndex].text}"
          </p>
          <div className="flex flex-col items-center gap-sm">
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#333', marginBottom: '8px' }}></div>
            <div>
              <h4 style={{ fontSize: '1.125rem', margin: 0 }}>{TESTIMONIALS[currentIndex].name}</h4>
              <span className="text-muted" style={{ fontSize: '0.9rem' }}>{TESTIMONIALS[currentIndex].subtitle}</span>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <div style={{ display: 'flex', justifyCenter: 'center', gap: '16px', marginTop: '24px', position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)' }}>
        <button onClick={prevSlide} className="btn-outline flex items-center justify-center" style={{ width: '40px', height: '40px', borderRadius: '50%' }}>
          <ChevronLeft size={20} />
        </button>
        <button onClick={nextSlide} className="btn-outline flex items-center justify-center" style={{ width: '40px', height: '40px', borderRadius: '50%' }}>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
