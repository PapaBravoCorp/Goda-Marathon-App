import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { MapPin, Calendar, Clock, Award, Info, Loader } from 'lucide-react';
import { getCurrentEvent } from '../utils/services/events';
import { getEventCategories } from '../utils/services/categories';
import { getEventSchedule } from '../utils/services/schedule';
import { CURRENT_EVENT } from '../utils/constants';

// Hardcoded fallback if DB fetch fails
const FALLBACK_EVENT = {
  name: 'GODA Epic Trail Run 2026',
  edition: '3rd',
  date: '2026-08-09',
  flag_off_time: '06:45 AM',
  location: 'Girnare, Nashik',
  venue: 'Palmstays, Nagalwadi, Girnare, Nashik',
  hero_image: '/images/trail_hero.png',
  description: 'Join us on the 9th August 2026 for the 3rd Edition of Goda Trail Run, hosted in the scenic Gangapur Backwaters, Nashik.',
  registration_open: true,
  categories: [
    { name: '2km Trail', distance: '2km', elevation: '0m', price: 299, status: 'Open', flag_off: '07:15 AM' },
    { name: '5km Trail', distance: '5km', elevation: '0m', price: 499, status: 'Open', flag_off: '07:10 AM' },
    { name: '10km Trail', distance: '10km', elevation: '100m', price: 799, status: 'Open', flag_off: '07:00 AM' },
    { name: '15km Trail', distance: '15km', elevation: '300m', price: 1299, status: 'Open', flag_off: '06:45 AM' },
  ],
  schedule: [
    { time: '06:00 AM', title: 'Event Assembly & Warm-up', day: 'Sunday, Aug 9 (Race Day)' },
    { time: '06:45 AM', title: '15km Category Starts', day: 'Flag-Off Timings' },
    { time: '07:00 AM', title: '10km Category Starts' },
    { time: '07:10 AM', title: '5km Category Starts' },
    { time: '07:15 AM', title: '2km Category Starts' },
    { time: '12:00 PM Onward', title: 'Award Ceremony & Refreshments', day: 'Post-Race' },
  ],
  features: [
    { title: 'Bib Expo & Kit Collection', description: 'Venue: Decathlon Nashik, Mumbai-Nashik Expressway, Off Vilholi, Opposite Jain Temple.\nAug 7: 12:00 PM – 08:00 PM\nAug 8: 12:00 PM – 05:00 PM', type: 'highlight' },
    { title: 'Registration Privileges', description: 'Bib number with timing chip, Marathon T-shirt, Finisher Medal & Certificate, Post-race Refreshments, Emergency Medical Services, Physiotherapists & Mountain Rescue.' },
    { title: 'Aid-Stations', description: 'Well-stocked aid stations at designated km points with drinking water, electrolyte drinks, glucose biscuits, fruits, and primary first aid. Please plan to run with at least 500 ml of water.' },
  ]
};

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price);
}

export default function EventDetails() {
  const [event, setEvent] = useState(null);
  const [dbCategories, setDbCategories] = useState([]);
  const [dbSchedule, setDbSchedule] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadEvent();
  }, []);

  const loadEvent = async () => {
    setIsLoading(true);
    try {
      const data = await getCurrentEvent();
      const ev = data || FALLBACK_EVENT;
      setEvent(ev);
      // Use event UUID for new table queries
      if (data?.id) {
        const [cats, sched] = await Promise.all([
          getEventCategories(data.id, CURRENT_EVENT.slug),
          getEventSchedule(data.id)
        ]);
        setDbCategories(cats);
        setDbSchedule(sched);
      }
    } catch {
      setEvent(FALLBACK_EVENT);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={32} className="spin" style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  const e = event;
  const categories = dbCategories.length > 0 ? dbCategories : (e.categories || []);
  const schedule = dbSchedule.length > 0 ? dbSchedule.map(s => ({ time: s.time, title: s.title, day: s.day_label })) : (e.schedule || []);
  const features = e.features || [];

  // Group schedule items by "day" headers
  const scheduleGroups = [];
  let currentGroup = null;
  schedule.forEach(item => {
    if (item.day) {
      currentGroup = { day: item.day, items: [item] };
      scheduleGroups.push(currentGroup);
    } else if (currentGroup) {
      currentGroup.items.push(item);
    } else {
      currentGroup = { day: '', items: [item] };
      scheduleGroups.push(currentGroup);
    }
  });

  return (
    <div>
      {/* Hero */}
      <div className="hero" style={{ minHeight: '50vh', background: `url(${e.hero_image || '/images/trail_hero.png'}) center/cover` }}>
        <div className="hero-overlay"></div>
        <div className="container" style={{ position: 'relative' }}>
          <h1 style={{ marginBottom: '16px' }}>
            {e.name ? (
              <>
                {e.name.replace(/trail.*/i, '')}
                <span className="accent-text">{e.name.match(/trail/i) ? 'Trail' : ''}</span>
                {e.name.replace(/.*trail/i, '')}
              </>
            ) : (
              <>Goda Epic <span className="accent-text">Trail</span></>
            )}
          </h1>
          <p className="text-muted" style={{ fontSize: '1.25rem', maxWidth: '600px' }}>
            {e.description}
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container event-layout">
          {/* Main Content */}
          <div className="event-main">
            <h2 style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '32px' }}>Race Information</h2>
            
            {/* Quick Info Grid */}
            <div className="glass" style={{ padding: '32px', borderRadius: '16px', marginBottom: '40px' }}>
              <div className="grid grid-cols-2 gap-md">
                <div className="flex items-start gap-sm">
                  <Calendar className="text-primary mt-1" />
                  <div>
                    <h4>Race Date</h4>
                    <p className="text-muted">{formatEventDate(e.date)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-sm">
                  <MapPin className="text-primary mt-1" />
                  <div>
                    <h4>Location</h4>
                    <p className="text-muted">{e.venue || e.location}</p>
                  </div>
                </div>
                <div className="flex items-start gap-sm">
                  <Clock className="text-primary mt-1" />
                  <div>
                    <h4>Flag-Off</h4>
                    <p className="text-muted">Starts at {e.flag_off_time || '06:45 AM'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-sm">
                  <Award className="text-primary mt-1" />
                  <div>
                    <h4>Categories</h4>
                    <p className="text-muted">{categories.map(c => c.distance).join(' | ')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Route Map Placeholder */}
            <h3 style={{ marginBottom: '24px' }}>Course Map</h3>
            <div style={{ width: '100%', height: '400px', backgroundColor: '#222', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#666', border: '1px dashed #444', marginBottom: '40px' }}>
              <MapPin size={48} style={{ marginBottom: '16px' }} />
              <p>Interactive Route Map (Coming Soon)</p>
            </div>

            {/* Schedule */}
            {scheduleGroups.length > 0 && (
              <>
                <h3 style={{ marginBottom: '24px' }}>Schedule</h3>
                <div style={{ borderLeft: '2px solid var(--color-primary)', paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  {scheduleGroups.map((group, gi) => (
                    <div key={gi} style={{ position: 'relative' }}>
                      <div style={{
                        position: 'absolute', left: '-31px', top: '0',
                        width: '14px', height: '14px', borderRadius: '50%',
                        background: gi === 0 ? 'var(--color-primary)' : gi === scheduleGroups.length - 1 ? 'var(--color-primary)' : 'var(--color-accent)',
                        boxShadow: `0 0 10px ${gi === 0 || gi === scheduleGroups.length - 1 ? 'var(--color-primary)' : 'var(--color-accent)'}`
                      }}></div>
                      {group.day && <h4 style={{ margin: '0 0 8px 0' }}>{group.day}</h4>}
                      {group.items.map((item, ii) => (
                        <div key={ii} style={{ marginBottom: ii < group.items.length - 1 ? '8px' : 0 }}>
                          <p className={gi === 0 || gi === scheduleGroups.length - 1 ? 'text-primary' : 'text-accent'} style={{ fontWeight: 600, marginBottom: '4px' }}>
                            {item.time}
                          </p>
                          <p className="text-muted">{item.title}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Features & Expo */}
            {features.length > 0 && (
              <>
                <h3 style={{ marginTop: '60px', marginBottom: '24px' }}>Event Features & Expo</h3>
                <div className="flex flex-col gap-sm">
                  {features.map((feat, i) => (
                    <div key={i} className="glass" style={{
                      padding: '24px', borderRadius: '8px',
                      borderLeft: feat.type === 'highlight' ? '4px solid var(--color-accent)' : 'none'
                    }}>
                      <h4 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {feat.type === 'highlight'
                          ? <MapPin size={18} className="text-accent" />
                          : <Info size={18} className="text-primary" />
                        }
                        {feat.title}
                      </h4>
                      <p className="text-muted" style={{ whiteSpace: 'pre-line' }}>{feat.description}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="event-sidebar">
            <div className="event-sidebar-inner">
              <div className="card" style={{ padding: '32px', borderTop: `4px solid ${e.registration_open ? 'var(--color-primary)' : 'var(--color-accent)'}` }}>
                <h3 style={{ marginBottom: '24px' }}>
                  {e.registration_open ? 'Register Now' : 'Registration Closed'}
                </h3>

                {categories.map((cat, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '12px',
                    paddingBottom: i === categories.length - 1 ? '24px' : '0',
                    borderBottom: i === categories.length - 1 ? '1px solid var(--color-border)' : 'none'
                  }}>
                    <span>
                      {cat.name}
                      {cat.elevation && cat.elevation !== '0m' && (
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}> (Elev: {cat.elevation})</span>
                      )}
                    </span>
                    <span style={{
                      fontWeight: 800,
                      color: (e.registration_open && cat.status === 'Open') ? 'var(--color-primary)' : 'var(--color-accent)'
                    }}>
                      {e.registration_open ? (cat.status || 'Open') : 'Closed'}
                    </span>
                  </div>
                ))}

                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '24px', textAlign: 'center' }}>
                  {e.registration_open
                    ? 'Registration is currently open. Secure your spot!'
                    : 'Registration for this event has closed.'}
                </p>

                <Link to="/register" style={{ textDecoration: 'none' }}>
                  <Button
                    variant={e.registration_open ? 'primary' : 'outline'}
                    style={{ width: '100%' }}
                    disabled={!e.registration_open}
                  >
                    {e.registration_open ? 'Secure Your Spot' : 'Registration Closed'}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
