import React, { useState, useEffect } from 'react';
import { Download, Users, IndianRupee, Activity, Search, Filter, Trash2, Lock, LogOut, Eye, EyeOff, ShieldCheck, RefreshCw, Image, Video, Plus, X } from 'lucide-react';
import { getRegistrations, getStats, exportToCSV, clearAll, getPastEventMedia, addPastEventMedia, deletePastEventMedia } from '../utils/storage';
import { CURRENT_EVENT } from '../utils/constants';
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

// ─── Media Management Tab ────────────────────────────────────────
function MediaManager() {
  const [media, setMedia] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    eventYear: '2025',
    eventTitle: 'Goda Epic Trail - 2nd Edition',
    mediaType: 'image',
    url: '',
    caption: '',
    displayOrder: 0
  });

  useEffect(() => {
    loadMedia();
  }, []);

  const loadMedia = async () => {
    setIsLoading(true);
    const data = await getPastEventMedia();
    setMedia(data);
    setIsLoading(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.url.trim()) {
      setFormError('Media URL is required.');
      return;
    }
    if (!formData.eventYear.trim()) {
      setFormError('Event year is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addPastEventMedia(formData);
      setFormData(prev => ({ ...prev, url: '', caption: '', displayOrder: 0 }));
      setShowForm(false);
      await loadMedia();
    } catch (err) {
      setFormError('Failed to add media. Please check the URL and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this media item?')) return;
    try {
      await deletePastEventMedia(id);
      await loadMedia();
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div>
      {/* Add Media Button / Form */}
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Past Events Media</h3>
        <button
          className="btn btn-primary admin-action-btn"
          onClick={() => setShowForm(!showForm)}
          style={{ gap: '6px' }}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
          <span className="admin-action-label">{showForm ? 'Cancel' : 'Add Media'}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="admin-media-form glass">
          <div className="admin-media-form-grid">
            <div className="admin-media-form-group">
              <label htmlFor="media-year">Event Year</label>
              <input id="media-year" name="eventYear" value={formData.eventYear} onChange={handleInput} placeholder="e.g. 2025" />
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="media-title">Event Title</label>
              <input id="media-title" name="eventTitle" value={formData.eventTitle} onChange={handleInput} placeholder="e.g. Goda Epic Trail Run" />
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="media-type">Media Type</label>
              <select id="media-type" name="mediaType" value={formData.mediaType} onChange={handleInput}>
                <option value="image">Image</option>
                <option value="video">Video (YouTube / Direct)</option>
              </select>
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="media-order">Display Order</label>
              <input id="media-order" name="displayOrder" type="number" value={formData.displayOrder} onChange={handleInput} />
            </div>
          </div>
          <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="media-url">Media URL *</label>
            <input id="media-url" name="url" value={formData.url} onChange={handleInput} placeholder="https://... (image or YouTube URL)" />
          </div>
          <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="media-caption">Caption</label>
            <input id="media-caption" name="caption" value={formData.caption} onChange={handleInput} placeholder="Optional description" />
          </div>

          {formError && (
            <div className="admin-login-error" style={{ marginTop: '0.75rem' }}>
              <span>{formError}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Add Media'}
          </button>
        </form>
      )}

      {/* Media Grid */}
      {isLoading ? (
        <div className="admin-empty-state">Loading media...</div>
      ) : media.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <p>No media added yet. Click "Add Media" to get started.</p>
        </div>
      ) : (
        <div className="admin-media-grid">
          {media.map(item => (
            <div key={item.id} className="admin-media-card glass">
              <div className="admin-media-preview">
                {item.media_type === 'image' ? (
                  <img
                    src={item.url}
                    alt={item.caption || 'Media'}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:0.8rem;">Image failed to load</div>';
                    }}
                  />
                ) : (
                  <div className="admin-media-video-badge">
                    <Video size={24} />
                    <span>Video</span>
                  </div>
                )}
              </div>
              <div className="admin-media-info">
                <div className="admin-media-meta">
                  <span className={`admin-badge ${item.media_type === 'image' ? 'admin-badge-paid' : 'admin-badge-pending'}`}>
                    {item.media_type}
                  </span>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>{item.event_year}</span>
                </div>
                {item.caption && (
                  <p className="admin-media-caption-text">{item.caption}</p>
                )}
                <button
                  className="admin-media-delete"
                  onClick={() => handleDelete(item.id)}
                  aria-label="Delete media"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Component ────────────────────────────────────────
export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('registrations');
  const [registrations, setRegistrations] = useState([]);
  const [stats, setStats] = useState({ totalRegistrations: 0, revenue: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && activeTab === 'registrations') {
      fetchData();
    }
  }, [isAuthenticated, activeTab]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [regsData, statsData] = await Promise.all([
        getRegistrations(CURRENT_EVENT.id),
        getStats(CURRENT_EVENT.id)
      ]);
      setRegistrations(regsData);
      setStats(statsData);
    } catch (error) {
      console.error("Error fetching admin data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
  };

  const handleExport = async () => {
    await exportToCSV(CURRENT_EVENT.id);
  };

  const handleClearData = async () => {
    if (window.confirm("Are you sure? This cannot be undone.") &&
        window.confirm("Final warning: Delete ALL data?")) {
      await clearAll();
      await fetchData();
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const filteredRegistrations = registrations.filter(r => {
    const matchesSearch = 
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter ? r.category === categoryFilter : true;
    
    return matchesSearch && matchesCategory;
  });

  if (!isAuthenticated) {
    return <AdminLogin onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="admin-page">
      <div className="container admin-container">
        {/* Header */}
        <div className="admin-header">
          <div className="admin-header-info">
            <h2>Admin <span className="text-primary">Dashboard</span></h2>
            <p className="text-muted">{CURRENT_EVENT.name}</p>
          </div>
          
          <div className="admin-header-actions">
            {activeTab === 'registrations' && (
              <>
                <button className="btn btn-outline admin-action-btn" onClick={fetchData} title="Refresh">
                  <RefreshCw size={18} className={isLoading ? 'spin' : ''} />
                  <span className="admin-action-label">Refresh</span>
                </button>
                <button className="btn btn-outline admin-action-btn" onClick={handleExport}>
                  <Download size={18} />
                  <span className="admin-action-label">Export</span>
                </button>
                <button className="btn btn-outline admin-action-btn admin-danger-btn" onClick={handleClearData}>
                  <Trash2 size={18} />
                  <span className="admin-action-label">Clear</span>
                </button>
              </>
            )}
            <button className="btn btn-outline admin-action-btn admin-logout-btn" onClick={handleLogout}>
              <LogOut size={18} />
              <span className="admin-action-label">Logout</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'registrations' ? 'active' : ''}`}
            onClick={() => setActiveTab('registrations')}
          >
            <Users size={18} />
            Registrations
          </button>
          <button
            className={`admin-tab ${activeTab === 'media' ? 'active' : ''}`}
            onClick={() => setActiveTab('media')}
          >
            <Image size={18} />
            Past Events Media
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'registrations' && (
          <>
            {/* Stats Cards */}
            <div className="admin-stats-grid">
              <div className="glass admin-stat-card">
                <div className="admin-stat-icon text-primary"><Users size={22} /></div>
                <div className="admin-stat-body">
                  <span className="admin-stat-label">Total Registrations</span>
                  <span className="admin-stat-value">{stats.totalRegistrations}</span>
                </div>
              </div>
              <div className="glass admin-stat-card">
                <div className="admin-stat-icon text-accent"><IndianRupee size={22} /></div>
                <div className="admin-stat-body">
                  <span className="admin-stat-label">Total Revenue</span>
                  <span className="admin-stat-value">{formatCurrency(stats.revenue)}</span>
                </div>
              </div>
              <div className="glass admin-stat-card">
                <div className="admin-stat-icon" style={{ color: 'var(--color-text-muted)' }}><Activity size={22} /></div>
                <div className="admin-stat-body">
                  <span className="admin-stat-label">System Status</span>
                  <span className="admin-stat-value admin-status-value">
                    <span className="admin-status-dot"></span>
                    Operational
                  </span>
                </div>
              </div>
            </div>

            {/* Registrations Section */}
            <div className="glass admin-table-section">
              <div className="admin-table-header">
                <h3>Recent Registrations</h3>
                <div className="admin-filters">
                  <div className="admin-search-wrap">
                    <Search size={16} className="admin-filter-icon" />
                    <input
                      id="admin-search"
                      type="text"
                      placeholder="Search name or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="admin-select-wrap">
                    <Filter size={16} className="admin-filter-icon" />
                    <select
                      id="admin-category-filter"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                      <option value="">All Categories</option>
                      <option value="5K Run">5K Run</option>
                      <option value="10K Run">10K Run</option>
                      <option value="Half Marathon">Half Marathon</option>
                      <option value="Full Marathon">Full Marathon</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Desktop: Table view */}
              <div className="admin-table-desktop">
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr>
                          <td colSpan="5" className="admin-empty-state">Loading data...</td>
                        </tr>
                      ) : filteredRegistrations.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="admin-empty-state">No registrations found.</td>
                        </tr>
                      ) : (
                        filteredRegistrations.map((row, i) => (
                          <tr key={row.id || i}>
                            <td className="admin-cell-name">{row.first_name} {row.last_name}</td>
                            <td className="admin-cell-muted">{row.email}</td>
                            <td>{row.category}</td>
                            <td className="admin-cell-muted">{new Date(row.created_at).toLocaleDateString()}</td>
                            <td>
                              <span className={`admin-badge ${row.payment_status === 'PAID' ? 'admin-badge-paid' : 'admin-badge-pending'}`}>
                                {row.payment_status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile: Card view */}
              <div className="admin-cards-mobile">
                {isLoading ? (
                  <div className="admin-empty-state">Loading data...</div>
                ) : filteredRegistrations.length === 0 ? (
                  <div className="admin-empty-state">No registrations found.</div>
                ) : (
                  filteredRegistrations.map((row, i) => (
                    <div key={row.id || i} className="admin-reg-card glass">
                      <div className="admin-reg-card-header">
                        <span className="admin-reg-card-name">{row.first_name} {row.last_name}</span>
                        <span className={`admin-badge ${row.payment_status === 'PAID' ? 'admin-badge-paid' : 'admin-badge-pending'}`}>
                          {row.payment_status}
                        </span>
                      </div>
                      <div className="admin-reg-card-details">
                        <div className="admin-reg-card-row">
                          <span className="admin-reg-card-label">Email</span>
                          <span className="admin-reg-card-value">{row.email}</span>
                        </div>
                        <div className="admin-reg-card-row">
                          <span className="admin-reg-card-label">Category</span>
                          <span className="admin-reg-card-value">{row.category}</span>
                        </div>
                        <div className="admin-reg-card-row">
                          <span className="admin-reg-card-label">Date</span>
                          <span className="admin-reg-card-value">{new Date(row.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {!isLoading && filteredRegistrations.length > 0 && (
                <div className="admin-table-footer">
                  Showing {filteredRegistrations.length} of {registrations.length} registrations
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'media' && (
          <MediaManager />
        )}
      </div>
    </div>
  );
}
