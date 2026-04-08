import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Calendar, MapPin, Users, Trophy, Star, ShieldCheck, Activity } from 'lucide-react';

export default function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section className="hero">
        <img src="/images/trail_hero.png" alt="Massive crowd running in a marathon" className="hero-bg" />
        <div className="hero-overlay"></div>
        <div className="container hero-content text-center" style={{ margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span className="badge badge-primary" style={{ marginBottom: '24px', fontSize: '1rem', padding: '8px 16px' }}>Upcoming Global Event</span>
          <h1 style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', marginBottom: '16px', letterSpacing: '-2px', textTransform: 'uppercase' }}>
            RUN BEYOND <span className="gradient-text">LIMITS</span>
          </h1>
          <p className="text-muted" style={{ fontSize: '1.25rem', maxWidth: '600px', marginBottom: '40px' }}>
            Push past your limits at the Goda Epic Trail Run 2026. Join us for the ultimate test of endurance, spirit, and connection with nature in the scenic Gangapur Backwaters.
          </p>
          <div className="flex gap-md" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link to="/register"><Button variant="primary" style={{ fontSize: '1.125rem', padding: '16px 40px' }}>Register Now</Button></Link>
            <Link to="/past-events"><Button variant="outline" style={{ fontSize: '1.125rem', padding: '16px 40px' }}>View Past Events</Button></Link>
          </div>
          
          <div className="glass" style={{ marginTop: '60px', padding: '24px', borderRadius: '16px', display: 'flex', gap: '40px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <Calendar size={24} /> <span style={{ fontWeight: 600 }}>Date</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem' }}>AUG 09, 2026</p>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <MapPin size={24} /> <span style={{ fontWeight: 600 }}>Location</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem' }}>GIRNARE, NASHIK</p>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm text-primary mb-sm">
                <Users size={24} /> <span style={{ fontWeight: 600 }}>Categories</span>
              </div>
              <p style={{ fontWeight: 800, fontSize: '1.2rem' }}>4 Distances</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="section" style={{ backgroundColor: '#050505' }}>
        <div className="container">
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
        </div>
      </section>

      {/* Next Events Highlight */}
      <section className="section">
        <div className="container">
          <div className="text-center" style={{ marginBottom: '60px' }}>
            <h2 style={{ fontSize: '2.5rem' }}>Upcoming <span className="accent-text">Categories</span></h2>
            <p className="text-muted" style={{ maxWidth: '600px', margin: '0 auto' }}>Choose your challenge. Whether you're a beginner or elite athlete, we have a route designed for your journey.</p>
          </div>
          
          <div className="grid grid-cols-3 gap-lg">
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
                <li className="flex items-center gap-sm"><MapPin size={18} className="text-primary" /> Beautiful lush trails</li>
                <li className="flex items-center gap-sm"><Trophy size={18} className="text-primary" /> Finisher Medal included</li>
                <li className="flex items-center gap-sm"><Activity size={18} className="text-primary" /> Aid stations on route</li>
              </ul>
            </Card>

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
                <li className="flex items-center gap-sm"><MapPin size={18} className="text-primary" /> 100m total elevation</li>
                <li className="flex items-center gap-sm"><Trophy size={18} className="text-primary" /> Premium Finisher Gear</li>
                <li className="flex items-center gap-sm"><Activity size={18} className="text-primary" /> G5 Team Support</li>
              </ul>
            </Card>

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
                <li className="flex items-center gap-sm"><MapPin size={18} className="text-primary" /> 300m total elevation</li>
                <li className="flex items-center gap-sm"><Trophy size={18} className="text-primary" /> Timing Chip included</li>
                <li className="flex items-center gap-sm"><ShieldCheck size={18} className="text-primary" /> Thrilling descents & climbs</li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Join Section */}
      <section className="section" style={{ backgroundColor: '#0A0A0A', borderTop: '1px solid var(--color-border)' }}>
        <div className="container">
          <div className="grid grid-cols-2 gap-xl items-center">
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
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section">
        <div className="container">
          <h2 className="text-center" style={{ fontSize: '2.5rem', marginBottom: '60px' }}>Join Our <span className="accent-text">Community</span></h2>
          <div className="grid grid-cols-3 gap-md">
            {[1,2,3].map((i) => (
              <div key={i} className="glass" style={{ padding: '32px', borderRadius: '16px' }}>
                <div className="flex gap-sm text-primary" style={{ marginBottom: '16px' }}>
                  <Star size={20} fill="#39FF14" />
                  <Star size={20} fill="#39FF14" />
                  <Star size={20} fill="#39FF14" />
                  <Star size={20} fill="#39FF14" />
                  <Star size={20} fill="#39FF14" />
                </div>
                <p style={{ fontSize: '1.125rem', fontStyle: 'italic', marginBottom: '24px' }}>
                  "The energy at the starting line was absolute electric. Best organized marathon I've ever ran. Will definitely be returning next year to beat my PR."
                </p>
                <div className="flex items-center gap-sm">
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#333' }}></div>
                  <div>
                    <h4 style={{ fontSize: '1rem', margin: 0 }}>Alex Johnson</h4>
                    <span className="text-muted" style={{ fontSize: '0.85rem' }}>2-Time Marathon Finisher</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
