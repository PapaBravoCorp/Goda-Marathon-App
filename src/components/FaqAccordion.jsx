import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';

const FAQS = [
  {
    question: "What is the minimum age to participate?",
    answer: "Participants must be at least 16 years old on race day to run the 15km, and 12 years old for the 5km/10km categories."
  },
  {
    question: "When and where is the bib collection?",
    answer: "Bib collection will be at the G5 Foundation Office in Nashik on August 7th and 8th. No bib collection will be available on race day."
  },
  {
    question: "Are there aid stations on the route?",
    answer: "Yes! There will be hydration and medical stations every 2.5km to ensure maximum safety and comfort during the race."
  },
  {
    question: "What is the cancellation or refund policy?",
    answer: "Registrations are non-refundable. However, you can transfer your bib to another runner up to 14 days before the event."
  }
];

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {FAQS.map((faq, index) => (
        <div key={index} className="glass" style={{ borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.3s' }} onClick={() => toggle(index)}>
          <div className="flex justify-between items-center" style={{ padding: '24px' }}>
            <h4 style={{ margin: 0, fontSize: '1.125rem' }}>{faq.question}</h4>
            <div style={{ padding: '4px', borderRadius: '50%', background: openIndex === index ? 'var(--color-primary)' : 'transparent', color: openIndex === index ? '#000' : 'var(--color-primary)', transition: 'all 0.3s' }}>
              {openIndex === index ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </div>
          <AnimatePresence>
            {openIndex === index && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '0 24px 24px 24px', color: 'var(--color-text-muted)' }}>
                  {faq.answer}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
