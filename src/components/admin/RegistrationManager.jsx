import React, { useState, useEffect } from 'react';
import { Download, Users, IndianRupee, Activity, Search, Filter, Trash2, RefreshCw, Edit3, CheckSquare, Square, XCircle } from 'lucide-react';
import { getRegistrations, getStats, exportToCSV, updateRegistration, deleteRegistration, bulkUpdatePaymentStatus, bulkDeleteRegistrations, getEventCategories } from '../../utils/storage';
import EditRegistrationModal from './EditRegistrationModal';

export default function RegistrationManager({ eventId, eventName }) {
  const [registrations, setRegistrations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({ totalRegistrations: 0, revenue: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingReg, setEditingReg] = useState(null);

  useEffect(() => { fetchData(); }, [eventId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [regsData, statsData, cats] = await Promise.all([
        getRegistrations(eventId),
        getStats(eventId),
        getEventCategories(eventId)
      ]);
      setRegistrations(regsData);
      setStats(statsData);
      setCategories(cats);
    } catch (error) {
      console.error("Error fetching admin data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => { await exportToCSV(eventId); };

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(r => r.id)));
    }
  };

  const handleBulkPaid = async () => {
    if (!window.confirm(`Mark ${selectedIds.size} registrations as PAID?`)) return;
    await bulkUpdatePaymentStatus([...selectedIds], 'PAID');
    setSelectedIds(new Set());
    await fetchData();
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Cancel ${selectedIds.size} registrations? (soft-delete)`)) return;
    await bulkDeleteRegistrations([...selectedIds]);
    setSelectedIds(new Set());
    await fetchData();
  };

  const handleTogglePayment = async (reg) => {
    const next = reg.payment_status === 'PAID' ? 'PENDING' : 'PAID';
    await updateRegistration(reg.id, { payment_status: next });
    await fetchData();
  };

  const handleDelete = async (reg) => {
    if (!window.confirm(`Cancel registration for ${reg.first_name} ${reg.last_name}?`)) return;
    await deleteRegistration(reg.id);
    await fetchData();
  };

  const handleEditSave = async (id, updates) => {
    await updateRegistration(id, updates);
    setEditingReg(null);
    await fetchData();
  };

  const filtered = registrations.filter(r => {
    const matchesSearch =
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.bib && r.bib.includes(searchTerm));
    const matchesCategory = categoryFilter ? r.category === categoryFilter : true;
    const matchesStatus = statusFilter ? r.payment_status === statusFilter : true;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const statusBadge = (status) => {
    const cls = status === 'PAID' ? 'admin-badge-paid' : status === 'CANCELLED' ? 'admin-badge-cancelled' : 'admin-badge-pending';
    return <span className={`admin-badge ${cls}`}>{status}</span>;
  };

  const categoryOptions = categories.length > 0
    ? categories.map(c => c.name)
    : [...new Set(registrations.map(r => r.category))];

  return (
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
              <span className="admin-status-dot"></span> Operational
            </span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="admin-reg-actions">
        <button className="btn btn-outline admin-action-btn" onClick={fetchData} title="Refresh">
          <RefreshCw size={18} className={isLoading ? 'spin' : ''} />
          <span className="admin-action-label">Refresh</span>
        </button>
        <button className="btn btn-outline admin-action-btn" onClick={handleExport}>
          <Download size={18} />
          <span className="admin-action-label">Export CSV</span>
        </button>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="admin-bulk-bar glass">
          <span>{selectedIds.size} selected</span>
          <button className="btn btn-primary" onClick={handleBulkPaid} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>Mark Paid</button>
          <button className="btn btn-outline admin-danger-btn" onClick={handleBulkDelete} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>Cancel Selected</button>
          <button className="btn btn-outline" onClick={() => setSelectedIds(new Set())} style={{ padding: '6px 14px', fontSize: '0.8rem' }}>Clear</button>
        </div>
      )}

      {/* Table Section */}
      <div className="glass admin-table-section">
        <div className="admin-table-header">
          <h3>Registrations</h3>
          <div className="admin-filters">
            <div className="admin-search-wrap">
              <Search size={16} className="admin-filter-icon" />
              <input type="text" placeholder="Search name, email, bib..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            <div className="admin-select-wrap">
              <Filter size={16} className="admin-filter-icon" />
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="">All Categories</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="admin-select-wrap">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ paddingLeft: '16px' }}>
                <option value="">All Status</option>
                <option value="PAID">Paid</option>
                <option value="PENDING">Pending</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </div>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="admin-table-desktop">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <button onClick={toggleSelectAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px' }}>
                      {selectedIds.size === filtered.length && filtered.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                  </th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Category</th>
                  <th>Bib</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan="8" className="admin-empty-state">Loading data...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan="8" className="admin-empty-state">No registrations found.</td></tr>
                ) : (
                  filtered.map((row, i) => (
                    <tr key={row.id || i} className={selectedIds.has(row.id) ? 'admin-row-selected' : ''}>
                      <td>
                        <button onClick={() => toggleSelect(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '4px' }}>
                          {selectedIds.has(row.id) ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                        </button>
                      </td>
                      <td className="admin-cell-name">{row.first_name} {row.last_name}</td>
                      <td className="admin-cell-muted">{row.email}</td>
                      <td>{row.category}</td>
                      <td><span className="admin-badge admin-badge-paid">{row.bib || '—'}</span></td>
                      <td className="admin-cell-muted">{new Date(row.created_at).toLocaleDateString()}</td>
                      <td>
                        <button onClick={() => handleTogglePayment(row)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Click to toggle">
                          {statusBadge(row.payment_status)}
                        </button>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="admin-row-actions">
                          <button className="admin-cat-action-btn" onClick={() => setEditingReg(row)} title="Edit"><Edit3 size={14} /></button>
                          <button className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => handleDelete(row)} title="Cancel"><XCircle size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="admin-cards-mobile">
          {isLoading ? (
            <div className="admin-empty-state">Loading data...</div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty-state">No registrations found.</div>
          ) : (
            filtered.map((row, i) => (
              <div key={row.id || i} className={`admin-reg-card glass ${selectedIds.has(row.id) ? 'admin-row-selected' : ''}`}>
                <div className="admin-reg-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button onClick={() => toggleSelect(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0 }}>
                      {selectedIds.has(row.id) ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                    </button>
                    <span className="admin-reg-card-name">{row.first_name} {row.last_name}</span>
                  </div>
                  <button onClick={() => handleTogglePayment(row)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {statusBadge(row.payment_status)}
                  </button>
                </div>
                <div className="admin-reg-card-details">
                  <div className="admin-reg-card-row"><span className="admin-reg-card-label">Email</span><span className="admin-reg-card-value">{row.email}</span></div>
                  <div className="admin-reg-card-row"><span className="admin-reg-card-label">Category</span><span className="admin-reg-card-value">{row.category}</span></div>
                  <div className="admin-reg-card-row"><span className="admin-reg-card-label">Bib</span><span className="admin-reg-card-value">{row.bib || '—'}</span></div>
                  <div className="admin-reg-card-row"><span className="admin-reg-card-label">Date</span><span className="admin-reg-card-value">{new Date(row.created_at).toLocaleDateString()}</span></div>
                </div>
                <div className="admin-card-actions">
                  <button className="admin-cat-action-btn" onClick={() => setEditingReg(row)}><Edit3 size={14} /> Edit</button>
                  <button className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => handleDelete(row)}><XCircle size={14} /> Cancel</button>
                </div>
              </div>
            ))
          )}
        </div>

        {!isLoading && filtered.length > 0 && (
          <div className="admin-table-footer">
            Showing {filtered.length} of {registrations.length} registrations
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingReg && (
        <EditRegistrationModal
          registration={editingReg}
          categories={categoryOptions}
          onSave={handleEditSave}
          onClose={() => setEditingReg(null)}
        />
      )}
    </>
  );
}
