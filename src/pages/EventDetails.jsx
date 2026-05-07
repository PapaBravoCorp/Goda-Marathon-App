import React from 'react';
import { Button } from '../components/Button';
import { MapPin, Calendar, Clock, Award, Info } from 'lucide-react';

export default function EventDetails() {
  return (
    <div>
      <div className="hero" style={{ minHeight: '50vh', background: 'url(/images/trail_hero.png) center/cover' }}>
        <div className="hero-overlay"></div>
        <div className="container" style={{ position: 'relative', paddingTop: '80px' }}>
          <h1 style={{ marginBottom: '16px' }}>Goda Epic <span className="accent-text">Trail</span></h1>
          <p className="text-muted" style={{ fontSize: '1.25rem', maxWidth: '600px' }}>Join us on the 9th August 2026 for the 3rd Edition of Goda Trail Run, hosted in the scenic Gangapur Backwaters, Nashik.</p>
        </div>
      </div>

      <section className="section">
        <div className="container event-layout">
          {/* Main Content */}
          <div className="event-main">
            <h2 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '32px' }}>Race Information</h2>
            
            <div className="glass" style={{ padding: '32px', borderRadius: '16px', marginBottom: '40px' }}>
              <div className="grid grid-cols-2 gap-md">
                <div className="flex items-start gap-sm">
                  <Calendar className="text-primary mt-1" />
                  <div>
                    <h4>Race Date</h4>
                    <p className="text-muted">Sunday, August 9, 2026</p>
                  </div>
                </div>
                <div className="flex items-start gap-sm">
                  <MapPin className="text-primary mt-1" />
                  <div>
                    <h4>Location</h4>
                    <p className="text-muted">Palmstays, Nagalwadi, Girnare, Nashik</p>
                  </div>
                </div>
                <div className="flex items-start gap-sm">
                  <Clock className="text-primary mt-1" />
                  <div>
                    <h4>Flag-Off</h4>
                    <p className="text-muted">Starts at 06:45 AM</p>
                  </div>
                </div>
                <div className="flex items-start gap-sm">
                  <Award className="text-primary mt-1" />
                  <div>
                    <h4>Categories</h4>
                    <p className="text-muted">2km | 5km | 10km | 15km</p>
                  </div>
                </div>
              </div>
            </div>

            <h3 style={{ marginBottom: '24px' }}>Course Map</h3>
            <div style={{ width: '100%', height: '400px', backgroundColor: '#222', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#666', border: '1px dashed #444', marginBottom: '40px' }}>
              <MapPin size={48} style={{ marginBottom: '16px' }} />
              <p>Interactive Route Map (Placeholder)</p>
            </div>

            <h3 style={{ marginBottom: '24px' }}>Schedule</h3>
            <div style={{ borderLeft: '2px solid var(--color-primary)', paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-31px', top: '0', width: '14px', height: '14px', borderRadius: '50%', background: 'var(--color-primary)', boxShadow: '0 0 10px var(--color-primary)' }}></div>
                <h4 style={{ margin: '0 0 8px 0' }}>Sunday, Aug 9 (Race Day)</h4>
                <p className="text-primary" style={{ fontWeight: 600, marginBottom: '4px' }}>06:00 AM</p>
                <p className="text-muted">Event Assembly & Warm-up</p>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-31px', top: '0', width: '14px', height: '14px', borderRadius: '50%', background: 'var(--color-accent)', boxShadow: '0 0 10px var(--color-accent)' }}></div>
                <h4 style={{ margin: '0 0 8px 0' }}>Flag-Off Timings</h4>
                <p className="text-accent" style={{ fontWeight: 600, marginBottom: '4px' }}>06:45 AM</p>
                <p className="text-muted">15km Category Starts</p>
                <p className="text-accent" style={{ fontWeight: 600, margin: '8px 0 4px 0' }}>07:00 AM</p>
                <p className="text-muted">10km Category Starts</p>
                <p className="text-accent" style={{ fontWeight: 600, margin: '8px 0 4px 0' }}>07:10 AM</p>
                <p className="text-muted">5km Category Starts</p>
                <p className="text-accent" style={{ fontWeight: 600, margin: '8px 0 4px 0' }}>07:15 AM</p>
                <p className="text-muted">2km Category Starts</p>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-31px', top: '0', width: '14px', height: '14px', borderRadius: '50%', background: 'var(--color-primary)', boxShadow: '0 0 10px var(--color-primary)' }}></div>
                <h4 style={{ margin: '0 0 8px 0' }}>Post-Race</h4>
                <p className="text-primary" style={{ fontWeight: 600, marginBottom: '4px' }}>12:00 PM Onward</p>
                <p className="text-muted">Award Ceremony & Refreshments</p>
              </div>
            </div>

            <h3 style={{ marginTop: '60px', marginBottom: '24px' }}>Event Features & Expo</h3>
            <div className="flex flex-col gap-sm">
              <div className="glass" style={{ padding: '24px', borderRadius: '8px', borderLeft: '4px solid var(--color-accent)' }}>
                <h4 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><MapPin size={18} className="text-accent" /> Bib Expo & Kit Collection</h4>
                <p className="text-muted" style={{ marginBottom: '8px' }}><strong>Venue:</strong> Decathlon Nashik, Mumbai-Nashik Expressway, Off Vilholi, Opposite Jain Temple.</p>
                <p className="text-muted"><strong>Aug 7, 2026:</strong> 12:00 PM – 08:00 PM<br/><strong>Aug 8, 2026:</strong> 12:00 PM – 05:00 PM</p>
              </div>
              <div className="glass" style={{ padding: '24px', borderRadius: '8px' }}>
                <h4 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><Info size={18} className="text-primary" /> Registration Privileges</h4>
                <p className="text-muted">Bib number with timing chip, Marathon T-shirt, Finisher Medal & Certificate, Post-race Refreshments, Emergency Medical Services, Physiotherapists & Mountain Rescue.</p>
              </div>
              <div className="glass" style={{ padding: '24px', borderRadius: '8px' }}>
                <h4 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}><Info size={18} className="text-primary" /> Aid-Stations</h4>
                <p className="text-muted">Well-stocked aid stations at designated km points with drinking water, electrolyte drinks, glucose biscuits, fruits, and primary first aid. Please plan to run with at least 500 ml of water.</p>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="event-sidebar">
            <div className="event-sidebar-inner">
              <div className="card" style={{ padding: '32px', borderTop: '4px solid var(--color-primary)' }}>
                <h3 style={{ marginBottom: '24px' }}>Register Now</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span>2km Trail</span>
                  <span style={{ fontWeight: 800 }}>Open</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span>5km Trail</span>
                  <span style={{ fontWeight: 800 }}>Open</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span>10km Trail (Elev: 100m)</span>
                  <span style={{ fontWeight: 800 }}>Open</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid var(--color-border)' }}>
                  <span>15km Trail (Elev: 300m)</span>
                  <span style={{ fontWeight: 800 }}>Open</span>
                </div>
                
                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '24px', textAlign: 'center' }}>
                  Registration is currently open. Secure your spot!
                </p>
                <a href="/register" style={{ textDecoration: 'none' }}>
                  <Button variant="primary" style={{ width: '100%' }}>Secure Your Spot</Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
