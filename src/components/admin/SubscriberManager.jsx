import React, { useState, useEffect, useCallback } from 'react';
import { Download, Mailbox, BellOff, Bell, RefreshCw } from 'lucide-react';
import { getSubscribers, setSubscribed } from '../../utils/services/newsletter';

/**
 * Newsletter subscribers.
 *
 * New panel: the footer form now stores addresses, so there has to be somewhere
 * to see them. Previously it collected nothing, so there was nothing to show.
 */
export default function SubscriberManager() {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setRows(await getSubscribers());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (row) => {
    setBusyId(row.id);
    setError('');
    try {
      await setSubscribed(row.id, !row.is_subscribed);
      await load();
    } catch (err) {
      setError(err.message || 'Could not update that subscriber.');
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const active = rows.filter(r => r.is_subscribed);
    if (active.length === 0) {
      setError('No active subscribers to export.');
      return;
    }
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Email', 'Source', 'Subscribed On'].map(cell).join(','),
      ...active.map(r => [
        cell(r.email),
        cell(r.source),
        cell(new Date(r.created_at).toLocaleDateString('en-IN')),
      ].join(',')),
    ].join('\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newsletter_subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const activeCount = rows.filter(r => r.is_subscribed).length;

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Newsletter Subscribers</h3>
        <button className="btn btn-primary admin-action-btn" onClick={exportCsv} style={{ gap: '6px' }}>
          <Download size={18} />
          <span className="admin-action-label">Export CSV</span>
        </button>
      </div>

      {error && (
        <div className="admin-save-msg error" style={{ marginBottom: '1rem' }}>{error}</div>
      )}

      <div className="admin-stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="glass admin-stat-card">
          <div className="admin-stat-icon text-primary"><Mailbox size={22} /></div>
          <div className="admin-stat-body">
            <span className="admin-stat-label">Active subscribers</span>
            <span className="admin-stat-value">{activeCount}</span>
          </div>
        </div>
        <div className="glass admin-stat-card">
          <div className="admin-stat-icon" style={{ color: 'var(--color-text-muted)' }}><BellOff size={22} /></div>
          <div className="admin-stat-body">
            <span className="admin-stat-label">Unsubscribed</span>
            <span className="admin-stat-value">{rows.length - activeCount}</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="admin-empty-state">Loading subscribers…</div>
      ) : rows.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <p>No one has signed up yet. The form is in the site footer.</p>
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: '14px', overflow: 'hidden' }}>
          <div className="results-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '14px 18px', fontWeight: 600 }}>Email</th>
                  <th scope="col" style={{ padding: '14px 18px', fontWeight: 600 }}>Source</th>
                  <th scope="col" style={{ padding: '14px 18px', fontWeight: 600 }}>Signed up</th>
                  <th scope="col" style={{ padding: '14px 18px', fontWeight: 600 }}>Status</th>
                  <th scope="col" style={{ padding: '14px 18px', fontWeight: 600, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} style={{ borderTop: '1px solid var(--color-border)', backgroundColor: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                    <td style={{ padding: '14px 18px' }}>{row.email}</td>
                    <td style={{ padding: '14px 18px' }} className="text-muted">{row.source || '—'}</td>
                    <td style={{ padding: '14px 18px' }} className="text-muted">
                      {new Date(row.created_at).toLocaleDateString('en-IN')}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span className={`admin-badge ${row.is_subscribed ? 'admin-badge-paid' : 'admin-badge-cancelled'}`}>
                        {row.is_subscribed ? 'Subscribed' : 'Unsubscribed'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <button
                        className="admin-cat-action-btn"
                        onClick={() => toggle(row)}
                        disabled={busyId === row.id}
                      >
                        {busyId === row.id
                          ? <RefreshCw size={14} className="spin" />
                          : row.is_subscribed ? <BellOff size={14} /> : <Bell size={14} />}
                        {row.is_subscribed ? 'Unsubscribe' : 'Resubscribe'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
