import React, { useState, useEffect } from 'react';
import { Download, Users, IndianRupee, Activity, Search, Filter, Trash2, Lock, LogOut, Eye, EyeOff, ShieldCheck, RefreshCw } from 'lucide-react';
import { getRegistrations, getStats, exportToCSV, clearAll } from '../utils/storage';
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

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated]);

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
            <button className="btn btn-outline admin-action-btn admin-logout-btn" onClick={handleLogout}>
              <LogOut size={18} />
              <span className="admin-action-label">Logout</span>
            </button>
          </div>
        </div>

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
      </div>
    </div>
  );
}
