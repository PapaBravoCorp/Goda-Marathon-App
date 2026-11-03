import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock, LogOut, Eye, EyeOff, ShieldCheck, Users, LayoutGrid,
  CalendarClock, Image, Settings, Mail, MessageSquare, Mailbox, AlertTriangle,
  UsersRound, Tag, Globe, BarChart3,
} from 'lucide-react';
import { CURRENT_EVENT } from '../utils/constants';
import { getCurrentEvent } from '../utils/services/events';
import { signIn, signOut, getSession, getDashboardRole, onAuthChange, describeAuthError } from '../utils/services/auth';

import RegistrationManager from '../components/admin/RegistrationManager';
import StatsPanel from '../components/admin/StatsPanel';
import RunnersPanel from '../components/admin/RunnersPanel';
import GroupManager from '../components/admin/GroupManager';
import CouponManager from '../components/admin/CouponManager';
import CategoryManager from '../components/admin/CategoryManager';
import ScheduleManager from '../components/admin/ScheduleManager';
import PastEventsManager from '../components/admin/PastEventsManager';
import EventSettings from '../components/admin/EventSettings';
import NotificationsManager from '../components/admin/NotificationsManager';
import ContentManager from '../components/admin/ContentManager';
import WebsiteSettings from '../components/admin/WebsiteSettings';
import SubscriberManager from '../components/admin/SubscriberManager';
import Seo from '../components/Seo';

import './Admin.css';

function AdminLogin({ onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const fail = (message) => {
    setError(message);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isBusy) return;

    setError('');
    setIsBusy(true);
    try {
      await signIn(email, password);

      // A valid account is not automatically allowed in. Ask the database
      // whether it is an admin or a stats viewer, and refuse the session
      // otherwise rather than showing a dashboard whose every panel would
      // come back empty.
      const role = await getDashboardRole();
      if (!role) {
        await signOut();
        fail('This account does not have access to the dashboard.');
        return;
      }
      onSignedIn(role);
    } catch (err) {
      fail(describeAuthError(err));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="admin-login-wrapper">
      <div className={`admin-login-card glass ${isShaking ? 'shake' : ''}`}>
        <div className="admin-login-icon">
          <ShieldCheck size={48} />
        </div>
        <h2 className="admin-login-title">Admin Access</h2>
        <p className="admin-login-subtitle">Sign in with your organiser or team account.</p>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="admin-password-field">
            <Mail size={18} className="admin-field-icon" />
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="you@example.com"
              autoComplete="username"
              required
              autoFocus
            />
          </div>

          <div className="admin-password-field">
            <Lock size={18} className="admin-field-icon" />
            <input
              id="admin-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Password"
              autoComplete="current-password"
              required
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
            <div className="admin-login-error" role="alert">
              <AlertTriangle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary admin-login-btn" disabled={isBusy}>
            {isBusy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'registrations', label: 'Registrations', icon: Users },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'groups', label: 'Groups', icon: UsersRound },
  { id: 'coupons', label: 'Coupons', icon: Tag },
  { id: 'categories', label: 'Categories', icon: LayoutGrid },
  { id: 'schedule', label: 'Schedule', icon: CalendarClock },
  { id: 'media', label: 'Past Events', icon: Image },
  { id: 'content', label: 'Content', icon: MessageSquare },
  { id: 'website', label: 'Website', icon: Globe },
  { id: 'event', label: 'Settings', icon: Settings },
  { id: 'notifications', label: 'Email', icon: Mail },
  { id: 'subscribers', label: 'Subscribers', icon: Mailbox },
];

// A stats viewer's whole dashboard. Admins keep Registrations instead of Runners.
const VIEWER_TABS = [
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'runners', label: 'Runners', icon: Users },
];

function TabBar({ tabs, active, onChange, labelled = false }) {
  return (
    <div className={`admin-tabs${labelled ? ' admin-tabs-labelled' : ''}`} role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={`admin-tab ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <tab.icon size={18} />
          <span className="admin-tab-label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

function SignOutButton({ onClick }) {
  return (
    <button className="btn btn-outline admin-action-btn admin-logout-btn" onClick={onClick}>
      <LogOut size={18} />
      <span className="admin-action-label">Sign out</span>
    </button>
  );
}

export default function Admin() {
  // checking | out | admin | viewer. A viewer gets Stats and Runners, nothing else.
  const [authState, setAuthState] = useState('checking');
  const [activeTab, setActiveTab] = useState('registrations');
  const [viewerTab, setViewerTab] = useState('stats');
  const [eventData, setEventData] = useState(null);

  const refreshAuth = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session) { setAuthState('out'); return; }
      const role = await getDashboardRole();
      if (role) { setAuthState(role); return; }
      // Signed in but neither admin nor viewer (or since deactivated): end the
      // session rather than leave a useless login sitting in the browser.
      await signOut().catch(() => {});
      setAuthState('out');
    } catch {
      setAuthState('out');
    }
  }, []);

  useEffect(() => {
    refreshAuth();
    // Keeps this tab honest when the session is ended somewhere else, or when
    // the refresh token finally expires while the dashboard sits open.
    return onAuthChange((session) => {
      if (!session) setAuthState('out');
      else refreshAuth();
    });
  }, [refreshAuth]);

  const isSignedIn = authState === 'admin' || authState === 'viewer';

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    getCurrentEvent().then(ev => { if (!cancelled) setEventData(ev); });
    return () => { cancelled = true; };
  }, [isSignedIn]);

  const handleLogout = async () => {
    await signOut();
    setEventData(null);
    setAuthState('out');
  };

  if (authState === 'checking') {
    return (
      <div className="admin-login-wrapper">
        <p className="text-muted">Checking your session…</p>
      </div>
    );
  }

  if (authState === 'out') {
    return (
      <>
        <Seo title="Admin Sign In" noIndex />
        <AdminLogin onSignedIn={(role) => setAuthState(role)} />
      </>
    );
  }

  // events.id doubles as the slug on this project ("goda-2026"), and
  // registrations.event_id stores that same text.
  const eventId = eventData?.id || CURRENT_EVENT.slug;

  if (authState === 'viewer') {
    return (
      <div className="admin-page">
        <Seo title="Team Dashboard" noIndex />
        <div className="container admin-container">
          <div className="admin-header">
            <div className="admin-header-info">
              <h2>Team <span className="text-primary">Dashboard</span></h2>
              <p className="text-muted">{eventData?.name || CURRENT_EVENT.name}</p>
            </div>
            <SignOutButton onClick={handleLogout} />
          </div>
          <TabBar tabs={VIEWER_TABS} active={viewerTab} onChange={setViewerTab} labelled />
          {viewerTab === 'stats' && <StatsPanel eventId={eventId} />}
          {viewerTab === 'runners' && <RunnersPanel eventId={eventId} />}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <Seo title="Admin Dashboard" noIndex />
      <div className="container admin-container">
        <div className="admin-header">
          <div className="admin-header-info">
            <h2>Admin <span className="text-primary">Dashboard</span></h2>
            <p className="text-muted">{eventData?.name || CURRENT_EVENT.name}</p>
          </div>
          <SignOutButton onClick={handleLogout} />
        </div>

        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {activeTab === 'registrations' && (
          <RegistrationManager eventSlug={eventId} eventUuid={eventId} />
        )}
        {activeTab === 'stats' && <StatsPanel eventId={eventId} />}
        {activeTab === 'groups' && <GroupManager eventSlug={eventId} />}
        {activeTab === 'coupons' && <CouponManager eventId={eventId} />}
        {activeTab === 'categories' && <CategoryManager eventId={eventId} eventSlug={eventId} />}
        {activeTab === 'schedule' && <ScheduleManager eventId={eventId} />}
        {activeTab === 'media' && <PastEventsManager />}
        {activeTab === 'content' && <ContentManager />}
        {activeTab === 'website' && <WebsiteSettings />}
        {activeTab === 'event' && <EventSettings />}
        {activeTab === 'notifications' && (
          <NotificationsManager eventUuid={eventId} eventSlug={eventId} />
        )}
        {activeTab === 'subscribers' && <SubscriberManager />}
      </div>
    </div>
  );
}
