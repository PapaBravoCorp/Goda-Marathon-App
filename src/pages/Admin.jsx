import React, { useState, useEffect } from 'react';
import { Lock, LogOut, Eye, EyeOff, ShieldCheck, Users, LayoutGrid, CalendarClock, Image, Settings, Mail } from 'lucide-react';
import { CURRENT_EVENT } from '../utils/constants';
import { getCurrentEvent } from '../utils/services/events';

import RegistrationManager from '../components/admin/RegistrationManager';
import CategoryManager from '../components/admin/CategoryManager';
import ScheduleManager from '../components/admin/ScheduleManager';
import MediaManager from '../components/admin/MediaManager';
import EventSettings from '../components/admin/EventSettings';
import NotificationsManager from '../components/admin/NotificationsManager';

import './Admin.css';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'goda2026';
const SESSION_KEY = 'goda-admin-auth';

function AdminLogin({ onLogin }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      onLogin();
    } else {
      setError('Invalid password. Access denied.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
    }
  };

  return (
    <div className="admin-login-wrapper">
      <div className={`admin-login-card glass ${isShaking ? 'shake' : ''}`}>
        <div className="admin-login-icon">
          <ShieldCheck size={48} />
        </div>
        <h2 className="admin-login-title">Admin Access</h2>
        <p className="admin-login-subtitle">Enter the admin password to access the dashboard.</p>
        
        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="admin-password-field">
            <Lock size={18} className="admin-field-icon" />
            <input
              id="admin-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter admin password"
              autoFocus
              autoComplete="current-password"
            />
            <button
              type="button"
              className="admin-toggle-password"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div className="admin-login-error">
              <Lock size={14} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary admin-login-btn">
            Unlock Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'registrations', label: 'Registrations', icon: Users },
  { id: 'categories', label: 'Categories', icon: LayoutGrid },
  { id: 'schedule', label: 'Schedule', icon: CalendarClock },
  { id: 'media', label: 'Media', icon: Image },
  { id: 'event', label: 'Settings', icon: Settings },
  { id: 'notifications', label: 'Email', icon: Mail },
];

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('registrations');
  const [eventData, setEventData] = useState(null);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Resolve event UUID dynamically
  useEffect(() => {
    if (isAuthenticated) {
      getCurrentEvent().then(ev => setEventData(ev));
    }
  }, [isAuthenticated]);

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AdminLogin onLogin={() => setIsAuthenticated(true)} />;
  }

  // Event UUID for new FK tables, slug for legacy registrations table
  const eventUuid = eventData?.id;
  const eventSlug = CURRENT_EVENT.slug;

  return (
    <div className="admin-page">
      <div className="container admin-container">
        {/* Header */}
        <div className="admin-header">
          <div className="admin-header-info">
            <h2>Admin <span className="text-primary">Dashboard</span></h2>
            <p className="text-muted">{eventData?.name || CURRENT_EVENT.name}</p>
          </div>
          <button className="btn btn-outline admin-action-btn admin-logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            <span className="admin-action-label">Logout</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={18} />
              <span className="admin-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content — pass both UUID and slug */}
        {activeTab === 'registrations' && (
          <RegistrationManager eventSlug={eventSlug} eventUuid={eventUuid} eventName={eventData?.name || CURRENT_EVENT.name} />
        )}
        {activeTab === 'categories' && (
          <CategoryManager eventId={eventUuid} eventSlug={eventSlug} />
        )}
        {activeTab === 'schedule' && (
          <ScheduleManager eventId={eventUuid} />
        )}
        {activeTab === 'media' && (
          <MediaManager />
        )}
        {activeTab === 'event' && (
          <EventSettings />
        )}
        {activeTab === 'notifications' && (
          <NotificationsManager eventUuid={eventUuid} eventSlug={eventSlug} />
        )}
      </div>
    </div>
  );
}
