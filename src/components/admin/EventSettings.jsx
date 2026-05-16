import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, CheckCircle } from 'lucide-react';
import { getCurrentEvent, updateEvent } from '../../utils/storage';

export default function EventSettings() {
  const [eventData, setEventData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => { loadEvent(); }, []);

  const loadEvent = async () => {
    setIsLoading(true);
    const data = await getCurrentEvent();
    setEventData(data);
    setIsLoading(false);
  };

  const handleInput = (e) => {
    const { name, value, type, checked } = e.target;
    setEventData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setSaveMsg('');
  };

  const handleSave = async () => {
    if (!eventData) return;
    setIsSaving(true);
    setSaveMsg('');
    try {
      await updateEvent(eventData.id, {
        name: eventData.name,
        date: eventData.date,
        location: eventData.location,
        venue: eventData.venue,
        description: eventData.description,
        flag_off_time: eventData.flag_off_time,
        registration_open: eventData.registration_open,
        edition: eventData.edition,
        hero_image: eventData.hero_image,
        last_registration_date: eventData.last_registration_date || null,
        total_slots: eventData.total_slots ? parseInt(eventData.total_slots) : null,
        contact_email: eventData.contact_email || null,
        contact_phone: eventData.contact_phone || null,
      });
      setSaveMsg('Event settings saved successfully!');
    } catch (err) {
      setSaveMsg('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="admin-empty-state">Loading event settings...</div>;
  if (!eventData) return (
    <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
      <p>No event found in the database. Please seed the events table first.</p>
    </div>
  );

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Event Settings</h3>
        <button className="btn btn-primary admin-action-btn" onClick={handleSave} disabled={isSaving} style={{ gap: '6px' }}>
          {isSaving ? <RefreshCw size={18} className="spin" /> : <Save size={18} />}
          <span className="admin-action-label">{isSaving ? 'Saving...' : 'Save Changes'}</span>
        </button>
      </div>

      {saveMsg && (
        <div className={`admin-save-msg ${saveMsg.includes('success') ? 'success' : 'error'}`}>
          <CheckCircle size={16} /> {saveMsg}
        </div>
      )}

      <div className="admin-event-form glass">
        {/* Basic Info */}
        <h4 className="admin-form-section-title">Basic Information</h4>
        <div className="admin-media-form-grid">
          <div className="admin-media-form-group">
            <label htmlFor="evt-name">Event Name</label>
            <input id="evt-name" name="name" value={eventData.name || ''} onChange={handleInput} />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-edition">Edition</label>
            <input id="evt-edition" name="edition" value={eventData.edition || ''} onChange={handleInput} placeholder="e.g. 3rd" />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-date">Event Date</label>
            <input id="evt-date" name="date" type="date" value={eventData.date || ''} onChange={handleInput} />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-flagoff">Flag-Off Time</label>
            <input id="evt-flagoff" name="flag_off_time" value={eventData.flag_off_time || ''} onChange={handleInput} placeholder="e.g. 06:45 AM" />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-location">Location</label>
            <input id="evt-location" name="location" value={eventData.location || ''} onChange={handleInput} />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-venue">Venue</label>
            <input id="evt-venue" name="venue" value={eventData.venue || ''} onChange={handleInput} />
          </div>
        </div>

        <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="evt-hero">Hero Image URL</label>
          <input id="evt-hero" name="hero_image" value={eventData.hero_image || ''} onChange={handleInput} placeholder="/images/trail_hero.png" />
        </div>
        <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="evt-desc">Description</label>
          <textarea id="evt-desc" name="description" value={eventData.description || ''} onChange={handleInput} rows={3} style={{ resize: 'vertical' }} />
        </div>

        {/* Registration Config */}
        <h4 className="admin-form-section-title" style={{ marginTop: '1.5rem' }}>Registration Configuration</h4>
        <div className="admin-media-form-grid">
          <div className="admin-media-form-group">
            <label htmlFor="evt-lastreg">Last Registration Date</label>
            <input id="evt-lastreg" name="last_registration_date" type="date" value={eventData.last_registration_date || ''} onChange={handleInput} />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-slots">Total Slots</label>
            <input id="evt-slots" name="total_slots" type="number" value={eventData.total_slots || ''} onChange={handleInput} placeholder="e.g. 500" />
          </div>
        </div>
        <div className="admin-event-toggle" style={{ marginTop: '1rem' }}>
          <label className="admin-toggle-label">
            <input type="checkbox" name="registration_open" checked={eventData.registration_open || false} onChange={handleInput} className="admin-toggle-checkbox" />
            <span className="admin-toggle-switch"></span>
            <span>Registration {eventData.registration_open ? 'Open' : 'Closed'}</span>
          </label>
        </div>

        {/* Contact Details */}
        <h4 className="admin-form-section-title" style={{ marginTop: '1.5rem' }}>Contact Details</h4>
        <div className="admin-media-form-grid">
          <div className="admin-media-form-group">
            <label htmlFor="evt-email">Contact Email</label>
            <input id="evt-email" name="contact_email" type="email" value={eventData.contact_email || ''} onChange={handleInput} placeholder="e.g. info@godatrailrun.com" />
          </div>
          <div className="admin-media-form-group">
            <label htmlFor="evt-phone">Contact Phone</label>
            <input id="evt-phone" name="contact_phone" value={eventData.contact_phone || ''} onChange={handleInput} placeholder="e.g. +91 82085 92273" />
          </div>
        </div>
      </div>
    </div>
  );
}
