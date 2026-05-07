import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Calendar, MapPin, Users, Trophy, ShieldCheck, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { CountdownTimer } from '../components/CountdownTimer';
import { TestimonialCarousel } from '../components/TestimonialCarousel';
import { FaqAccordion } from '../components/FaqAccordion';

export default function Home() {
  const [expandedRoute, setExpandedRoute] = useState(null);

  const toggleRoute = (route) => {
    setExpandedRoute(expandedRoute === route ? null : route);
  };

  const fadeUpVariant = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="hero">
        <img src="/images/trail_hero.png" alt="Massive crowd running in a marathon" className="hero-bg" />
        <div className="hero-overlay"></div>
        <div className="container hero-content text-center" style={{ margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <motion.span initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="badge badge-primary" style={{ marginBottom: '24px', fontSize: '1rem', padding: '8px 16px' }}>Upcoming Global Event</motion.span>
          <motion.h1 initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', marginBottom: '16px', letterSpacing: '-2px', textTransform: 'uppercase' }}>
            RUN BEYOND <span className="gradient-text">LIMITS</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-muted" style={{ fontSize: '1.25rem', maxWidth: '600px', marginBottom: '40px' }}>
            Push past your limits at the Goda Epic Trail Run 2026. Join us for the ultimate test of endurance, spirit, and connection with nature in the scenic Gangapur Backwaters.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex gap-md" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link to="/register"><Button variant="primary" style={{ fontSize: '1.125rem', padding: '16px 40px' }}>Register Now</Button></Link>
            <Link to="/past-events"><Button variant="outline" style={{ fontSize: '1.125rem', padding: '16px 40px' }}>View Past Events</Button></Link>
          </motion.div>
          
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass" style={{ marginTop: '60px', padding: '24px', borderRadius: '16px', display: 'flex', gap: '40px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <Calendar size={24} /> <span style={{ fontWeight: 600 }}>Date</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem', margin: 0 }}>AUG 09, 2026</p>
              <CountdownTimer targetDate="2026-08-09T00:00:00" />
            </div>
            <div style={{ width: '1px', alignSelf: 'stretch', background: 'rgba(255,255,255,0.1)' }}></div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <MapPin size={24} /> <span style={{ fontWeight: 600 }}>Location</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem' }}>GIRNARE, NASHIK</p>
            </div>
            <div style={{ width: '1px', alignSelf: 'stretch', background: 'rgba(255,255,255,0.1)' }}></div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <Users size={24} /> <span style={{ fontWeight: 600 }}>Categories</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem' }}>4 Distances</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="section" style={{ backgroundColor: '#050505' }}>
        <motion.div variants={fadeUpVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="container">
          <div className="grid grid-cols-4 gap-lg text-center">
            <div>
              <h2 className="text-primary">3rd</h2>
              <p className="text-muted">Edition</p>
            </div>
            <div>
              <h2 className="text-primary">15km</h2>
              <p className="text-muted">Max Distance</p>
            </div>
            <div>
              <h2 className="text-primary">300m</h2>
              <p className="text-muted">Max Elevation</p>
            </div>
            <div>
              <h2 className="text-primary">All</h2>
              <p className="text-muted">Levels Welcome</p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Next Events Highlight */}
      <section className="section">
        <div className="container">
          <motion.div variants={fadeUpVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center" style={{ marginBottom: '60px' }}>
            <h2 style={{ fontSize: '2.5rem' }}>Upcoming <span className="accent-text">Categories</span></h2>
            <p className="text-muted" style={{ maxWidth: '600px', margin: '0 auto' }}>Choose your challenge. Whether you're a beginner or elite athlete, we have a route designed for your journey.</p>
          </motion.div>
          
          <div className="grid grid-cols-3 gap-lg">
            {/* 5KM */}
            <motion.div variants={fadeUpVariant} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}>
              <Card 
                image="/images/trail_event1.png"
                badge={<span className="badge badge-primary">Open</span>}
                title="5km Trail"
                subtitle="Great for beginners and casual runners."
                footer={
                  <Link to="/register"><Button variant="outline" style={{ width: '100%' }}>Register for 5km</Button></Link>
                }
              >
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <li className="flex items-center gap-sm"><MapPin size={18} className="text-primary card-icon" /> Beautiful lush trails</li>
                  <li className="flex items-center gap-sm"><Trophy size={18} className="text-primary card-icon" /> Finisher Medal included</li>
                  <li className="flex items-center gap-sm"><Activity size={18} className="text-primary card-icon" /> Aid stations on route</li>
                </ul>
                <div style={{ marginTop: '16px' }}>
                  <button onClick={() => toggleRoute('5km')} className="btn-outline flex items-center justify-center gap-sm" style={{ width: '100%', padding: '8px', fontSize: '0.9rem', cursor: 'pointer', borderRadius: '4px' }}>
                    View Route {expandedRoute === '5km' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <AnimatePresence>
                    {expandedRoute === '5km' && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginTop: '12px' }}>
                        <img src="/images/elevation_5km.png" alt="5km Elevation Profile" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--color-border)' }} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Card>
            </motion.div>

            {/* 10KM */}
            <motion.div variants={fadeUpVariant} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}>
              <Card 
                image="/images/trail_event2.png"
                badge={<span className="badge badge-primary" style={{ backgroundColor: 'rgba(255, 107, 0, 0.1)', color: 'var(--color-accent)' }}>Open</span>}
                title="10km Trail"
                subtitle="A perfect blend of endurance and fun."
                footer={
                  <Link to="/register"><Button variant="outline" style={{ width: '100%' }}>Register for 10km</Button></Link>
                }
              >
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <li className="flex items-center gap-sm"><MapPin size={18} className="text-primary card-icon" /> 100m total elevation</li>
                  <li className="flex items-center gap-sm"><Trophy size={18} className="text-primary card-icon" /> Premium Finisher Gear</li>
                  <li className="flex items-center gap-sm"><Activity size={18} className="text-primary card-icon" /> G5 Team Support</li>
                </ul>
                <div style={{ marginTop: '16px' }}>
                  <button onClick={() => toggleRoute('10km')} className="btn-outline flex items-center justify-center gap-sm" style={{ width: '100%', padding: '8px', fontSize: '0.9rem', cursor: 'pointer', borderRadius: '4px' }}>
                    View Route {expandedRoute === '10km' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <AnimatePresence>
                    {expandedRoute === '10km' && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginTop: '12px' }}>
                        <img src="/images/elevation_10km.png" alt="10km Elevation Profile" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--color-border)' }} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Card>
            </motion.div>

            {/* 15KM */}
            <motion.div variants={fadeUpVariant} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}>
              <Card 
                image="/images/trail_hero.png"
                badge={<span className="badge badge-primary" style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#fff' }}>Open</span>}
                title="15km Trail"
                subtitle="The ultimate epic trail challenge."
                footer={
                  <Link to="/register"><Button variant="primary" style={{ width: '100%' }}>Register for 15km</Button></Link>
                }
              >
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <li className="flex items-center gap-sm"><MapPin size={18} className="text-primary card-icon" /> 300m total elevation</li>
                  <li className="flex items-center gap-sm"><Trophy size={18} className="text-primary card-icon" /> Timing Chip included</li>
                  <li className="flex items-center gap-sm"><ShieldCheck size={18} className="text-primary card-icon" /> Thrilling descents & climbs</li>
                </ul>
                <div style={{ marginTop: '16px' }}>
                  <button onClick={() => toggleRoute('15km')} className="btn-outline flex items-center justify-center gap-sm" style={{ width: '100%', padding: '8px', fontSize: '0.9rem', cursor: 'pointer', borderRadius: '4px' }}>
                    View Route {expandedRoute === '15km' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <AnimatePresence>
                    {expandedRoute === '15km' && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginTop: '12px' }}>
                        <img src="/images/elevation_15km.png" alt="15km Elevation Profile" style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--color-border)' }} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Card>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Why Join Section */}
      <section className="section" style={{ backgroundColor: '#0A0A0A', borderTop: '1px solid var(--color-border)' }}>
        <div className="container">
          <motion.div variants={fadeUpVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="grid grid-cols-2 gap-xl items-center">
            <div>
              <img src="/images/trail_event2.png" alt="Runner celebrating" style={{ width: '100%', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '2.5rem', marginBottom: '24px' }}>More Than Just A Race. It's an <span className="accent-text">Experience.</span></h2>
              <div className="flex flex-col gap-md">
                <div className="flex gap-sm">
                  <div style={{ background: 'rgba(57,255,20,0.1)', padding: '16px', borderRadius: '12px', height: 'fit-content' }}>
                    <ShieldCheck size={32} className="text-primary" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>World-Class Organization</h3>
                    <p className="text-muted">Experience seamless registration, secure bag drops, and meticulously planned routes with zero traffic disruptions.</p>
                  </div>
                </div>
                <div className="flex gap-sm">
                  <div style={{ background: 'rgba(57,255,20,0.1)', padding: '16px', borderRadius: '12px', height: 'fit-content' }}>
                    <Trophy size={32} className="text-primary" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Premium Race Kit</h3>
                    <p className="text-muted">Every runner receives a high-quality Dri-FIT tee, personalized bib, and our heavy-weight custom sculpted medal.</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section">
        <motion.div variants={fadeUpVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="container">
          <h2 className="text-center" style={{ fontSize: '2.5rem', marginBottom: '60px' }}>Join Our <span className="accent-text">Community</span></h2>
          <TestimonialCarousel />
        </motion.div>
      </section>

      {/* FAQ Section */}
      <section className="section" style={{ backgroundColor: '#050505', borderTop: '1px solid var(--color-border)' }}>
        <motion.div variants={fadeUpVariant} initial="hidden" whileInView="visible" viewport={{ once: true }} className="container">
          <h2 className="text-center" style={{ fontSize: '2.5rem', marginBottom: '60px' }}>Frequently Asked <span className="accent-text">Questions</span></h2>
          <FaqAccordion />
        </motion.div>
      </section>
    </div>
  );
}
