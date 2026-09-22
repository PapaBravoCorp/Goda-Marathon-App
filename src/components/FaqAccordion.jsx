import React, { useState, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { getPublishedFaqs } from '../utils/services/content';

export function FaqAccordion() {
  const [faqs, setFaqs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const baseId = useId();

  useEffect(() => {
    let cancelled = false;
    getPublishedFaqs()
      .then(rows => { if (!cancelled) setFaqs(rows); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // The whole section disappears when there is nothing to show, heading
  // included — otherwise the title would float above an empty gap.
  if (isLoading || faqs.length === 0) return null;

  return (
    <section
      id="faq"
      className="section"
      style={{ backgroundColor: '#050505', borderTop: '1px solid var(--color-border)' }}
    >
      <div className="container">
        <h2 className="text-center" style={{ fontSize: '2.5rem', marginBottom: '60px' }}>
          Frequently Asked <span className="accent-text">Questions</span>
        </h2>

        <div className="faq-list">
          {faqs.map((faq) => {
            const isOpen = openId === faq.id;
            const panelId = `${baseId}-panel-${faq.id}`;
            const buttonId = `${baseId}-button-${faq.id}`;

            return (
              <div key={faq.id} className="faq-item glass">
                {/* A real button: the previous version was a clickable <div>,
                    which could not be reached or operated by keyboard. */}
                <button
                  type="button"
                  id={buttonId}
                  className="faq-question"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenId(isOpen ? null : faq.id)}
                >
                  <span>{faq.question}</span>
                  <span className={`faq-chevron ${isOpen ? 'is-open' : ''}`} aria-hidden="true">
                    <ChevronDown size={20} />
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      role="region"
                      aria-labelledby={buttonId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="faq-answer">{faq.answer}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
