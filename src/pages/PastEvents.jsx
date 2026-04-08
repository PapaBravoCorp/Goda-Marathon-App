import React, { useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Users, MapPin, X } from 'lucide-react';

export default function PastEvents() {
  const [selectedEvent, setSelectedEvent] = useState(null);

  const pastEvents = [
    { id: 1, year: "2025", title: "Goda Epic Trail - 2nd Edition", participants: "1000+", image: "/images/trail_hero.png" },
  ];

  return (
    <div className="section">
      <div className="container">
        <div className="text-center" style={{ marginBottom: '60px' }}>
          <h1 style={{ fontSize: '3.5rem', marginBottom: '16px' }}>Our <span className="accent-text">Legacy</span></h1>
          <p className="text-muted" style={{ maxWidth: '600px', margin: '0 auto', fontSize: '1.25rem' }}>
            A look back at the incredible moments, broken records, and unyielding spirit of our past marathons.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-lg">
          {pastEvents.map((event) => (
            <div key={event.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedEvent(event)}>
              <Card 
                image={event.image}
                title={`${event.title} ${event.year}`}
              >
                <div className="flex items-center gap-sm mt-3">
                  <Users size={18} className="text-primary" />
                  <span>{event.participants} Finishers</span>
                </div>
                <Button variant="outline" className="mt-4" style={{ marginTop: '16px', width: '100%' }}>View Gallery</Button>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {/* Modal for Event Details */}
      {selectedEvent && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="glass" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px', position: 'relative' }}>
            <button onClick={() => setSelectedEvent(null)} style={{ position: 'absolute', top: '24px', right: '24px', background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff', padding: '8px', borderRadius: '50%', cursor: 'pointer', zIndex: 10 }}>
              <X size={24} />
            </button>
            
            <img src={selectedEvent.image} alt="Event Cover" style={{ width: '100%', height: '300px', objectFit: 'cover' }} />
            
            <div style={{ padding: '40px' }}>
              <h2 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{selectedEvent.title} ({selectedEvent.year})</h2>
              <p className="text-primary" style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '32px' }}>{selectedEvent.participants} Trail Runners</p>
              <p className="text-muted" style={{ marginBottom: '40px' }}>
                Held on October 5, 2025, in the scenic Gangapur Backwaters, Nagalwadi, Girnare. An epic trail run experience that connected runners with nature through lush trails and rolling hills.
              </p>

              <h3 style={{ marginBottom: '24px' }}>Photo Gallery</h3>
              <div className="grid grid-cols-3 gap-sm">
                <img src="/images/trail_event1.png" style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }} />
                <img src="/images/trail_event2.png" style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }} />
                <img src="/images/trail_hero.png" style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px' }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
