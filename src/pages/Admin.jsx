import React, { useState } from 'react';
import { Download, Users, DollarSign, Activity, Search, Filter, Trash2 } from 'lucide-react';
import { getRegistrations, getStats, exportToCSV, clearAll } from '../utils/storage';
import { CURRENT_EVENT } from '../utils/constants';

export default function Admin() {
  const [registrations, setRegistrations] = useState(() => {
    const data = getRegistrations(CURRENT_EVENT.id);
    return data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  });
  const [stats, setStats] = useState(() => getStats(CURRENT_EVENT.id));
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const handleExport = () => {
    exportToCSV(CURRENT_EVENT.id);
  };

  const handleClearData = () => {
    if (window.confirm("Are you sure? This cannot be undone.") &&
        window.confirm("Final warning: Delete ALL data?")) {
      clearAll();
      setRegistrations([]);
      setStats({ totalRegistrations: 0, revenue: 0 });
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const filteredRegistrations = registrations.filter(r => {
    const matchesSearch = 
      `${r.firstName} ${r.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter ? r.category === categoryFilter : true;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="section" style={{ background: '#050505', minHeight: '80vh' }}>
      <div className="container" style={{ maxWidth: '1000px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ margin: 0 }}>Admin <span className="text-primary">Dashboard</span></h2>
            <p className="text-muted" style={{ margin: 0 }}>Viewing data for {CURRENT_EVENT.name}</p>
          </div>
          
          <div style={{ display: 'flex', gap: '16px' }}>
            <button className="btn btn-outline" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}>
              <Download size={18} /> Export Data
            </button>
            <button className="btn btn-outline" onClick={handleClearData} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderColor: 'rgba(255, 60, 60, 0.5)', color: '#ff6b6b' }}>
              <Trash2 size={18} /> Clear Data
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-md" style={{ marginBottom: '40px' }}>
          <div className="glass" style={{ padding: '24px', borderRadius: '12px' }}>
            <div className="flex items-center gap-sm text-primary mb-sm"><Users size={24} /> Total Registrations</div>
            <h3 style={{ fontSize: '2.5rem', margin: 0 }}>{stats.totalRegistrations}</h3>
            <p className="text-primary" style={{ fontSize: '0.85rem', marginTop: '8px' }}>Active Participants</p>
          </div>
          <div className="glass" style={{ padding: '24px', borderRadius: '12px' }}>
            <div className="flex items-center gap-sm text-accent mb-sm"><DollarSign size={24} /> Total Revenue</div>
            <h3 style={{ fontSize: '2.5rem', margin: 0 }}>{formatCurrency(stats.revenue)}</h3>
            <p className="text-primary" style={{ fontSize: '0.85rem', marginTop: '8px' }}>Processed Payments</p>
          </div>
          <div className="glass" style={{ padding: '24px', borderRadius: '12px' }}>
            <div className="flex items-center gap-sm text-muted mb-sm"><Activity size={24} /> System Status</div>
            <h3 style={{ fontSize: '1.5rem', margin: '14px 0 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', background: 'var(--color-primary)', borderRadius: '50%' }}></div>
              All Systems Operational
            </h3>
          </div>
        </div>

        <div className="glass" style={{ borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <h3 style={{ margin: 0 }}>Recent Registrations</h3>
            
            <div style={{ display: 'flex', gap: '16px', flex: 1, justifyContent: 'flex-end' }}>
              <div style={{ position: 'relative', width: '250px' }}>
                <Search style={{ position: 'absolute', top: '10px', left: '12px', color: 'var(--color-text-muted)' }} size={16} />
                <input 
                  type="text" 
                  placeholder="Search name or email..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ paddingLeft: '40px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', fontSize: '0.9rem', width: '100%' }}
                />
              </div>
              <div style={{ position: 'relative', width: '180px' }}>
                <Filter style={{ position: 'absolute', top: '10px', left: '12px', color: 'var(--color-text-muted)' }} size={16} />
                <select 
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{ paddingLeft: '40px', paddingRight: '12px', paddingTop: '8px', paddingBottom: '8px', fontSize: '0.9rem', width: '100%', appearance: 'none', background: 'var(--color-bg-surface-light)', borderRadius: '6px' }}
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
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'transparent', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '16px 8px', color: 'var(--color-text-muted)' }}>Name</th>
                  <th style={{ padding: '16px 8px', color: 'var(--color-text-muted)' }}>Email</th>
                  <th style={{ padding: '16px 8px', color: 'var(--color-text-muted)' }}>Category</th>
                  <th style={{ padding: '16px 8px', color: 'var(--color-text-muted)' }}>Date</th>
                  <th style={{ padding: '16px 8px', color: 'var(--color-text-muted)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrations.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      No registrations found.
                    </td>
                  </tr>
                ) : (
                  filteredRegistrations.map((row, i) => (
                    <tr key={row.id || i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '16px 8px', fontWeight: 600 }}>{row.firstName} {row.lastName}</td>
                      <td style={{ padding: '16px 8px', color: 'var(--color-text-muted)' }}>{row.email}</td>
                      <td style={{ padding: '16px 8px' }}>{row.category}</td>
                      <td style={{ padding: '16px 8px', color: 'var(--color-text-muted)' }}>
                        {new Date(row.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '16px 8px' }}>
                        <span style={{ 
                          padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold',
                          background: row.paymentStatus === 'PAID' ? 'rgba(57,255,20,0.1)' : 'rgba(255,107,0,0.1)',
                          color: row.paymentStatus === 'PAID' ? 'var(--color-primary)' : 'var(--color-accent)'
                        }}>
                          {row.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
