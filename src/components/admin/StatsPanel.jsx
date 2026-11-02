import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Download, Users, CircleCheck, Clock, Ban } from 'lucide-react';
import { getRegStats, describeStatsError } from '../../utils/services/stats';
import { summariseStats, statsCsvRows, STATS_CSV_HEADER } from '../../utils/regStats';
import { downloadCsv } from '../../utils/csv';

// The page is left open on a laptop at the registration desk; keep it current
// without anyone pressing Refresh, but only while it is actually on screen.
const REFRESH_MS = 60_000;

const formatDay = (isoDay) => {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
};

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

function StatTile({ icon: Icon, iconClass, label, value, note }) {
  return (
    <div className="glass admin-stat-card">
      <div className={`admin-stat-icon ${iconClass}`}><Icon size={22} aria-hidden="true" /></div>
      <div className="admin-stat-body">
        <span className="admin-stat-label">{label}</span>
        <span className="admin-stat-value">{value.toLocaleString('en-IN')}</span>
        {note && <span className="admin-stat-note">{note}</span>}
      </div>
    </div>
  );
}

function CountCells({ row }) {
  return (
    <>
      <td className="admin-num">{row.paid}</td>
      <td className="admin-num">{row.pending}</td>
      <td className="admin-num admin-cell-muted">{row.cancelled}</td>
    </>
  );
}

function BreakdownTable({ title, hint, firstColumn, rows }) {
  return (
    <section className="glass admin-table-section admin-stats-section">
      <div className="admin-stats-section-head">
        <h3>{title}</h3>
        <p className="text-muted">{hint}</p>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table admin-stats-table">
          <thead>
            <tr>
              <th scope="col">{firstColumn}</th>
              <th scope="col" className="admin-num">Entries</th>
              <th scope="col" className="admin-num">Paid</th>
              <th scope="col" className="admin-num">Pending</th>
              <th scope="col" className="admin-num">Cancelled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="admin-cell-name">{row.label}</th>
                <td className="admin-num admin-stats-strong">{row.entries}</td>
                <CountCells row={row} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Registration counts for one event. Shown to admins as a tab and to stats
 * viewers as their whole dashboard. Everything comes from get_reg_stats(),
 * which returns counts only, so nothing here can show a runner's details.
 */
export default function StatsPanel({ eventId }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setIsLoading(true);
    try {
      const data = await getRegStats(eventId);
      if (request !== latestRequest.current) return;
      setStats(data);
      setError('');
    } catch (err) {
      if (request !== latestRequest.current) return;
      console.error('Error fetching registration stats', err);
      setError(describeStatsError(err));
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const summary = useMemo(() => summariseStats(stats), [stats]);

  const handleDownload = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`registration-stats_${eventId}_${date}.csv`, STATS_CSV_HEADER, statsCsvRows(stats));
  };

  const { totals, byCategory, byCode, byDay, maxDayEntries } = summary;

  return (
    <div className="admin-stats-panel">
      <div className="admin-stats-grid">
        <StatTile icon={Users} iconClass="text-primary" label="Entries" value={totals.entries} note="Paid + pending" />
        <StatTile icon={CircleCheck} iconClass="text-primary" label="Paid" value={totals.paid} />
        <StatTile icon={Clock} iconClass="text-accent" label="Pending" value={totals.pending} note="Awaiting payment" />
        <StatTile icon={Ban} iconClass="admin-cell-muted" label="Cancelled" value={totals.cancelled} note="Not counted in entries" />
      </div>

      <div className="admin-reg-actions">
        <button className="btn btn-outline admin-action-btn" onClick={load} disabled={isLoading}>
          <RefreshCw size={18} className={isLoading ? 'spin' : ''} aria-hidden="true" />
          <span className="admin-action-label">Refresh</span>
        </button>
        <button className="btn btn-outline admin-action-btn" onClick={handleDownload} disabled={!stats}>
          <Download size={18} aria-hidden="true" />
          <span className="admin-action-label">Download CSV</span>
        </button>
        {stats?.generated_at && (
          <span className="admin-stats-updated text-muted" role="status">
            Updated {formatTime(stats.generated_at)} · refreshes every minute
          </span>
        )}
      </div>

      {error && <div className="admin-save-msg error" role="alert">{error}</div>}

      {!stats && isLoading && <p className="text-muted">Loading the numbers…</p>}

      {stats && summary.isEmpty && (
        <div className="glass admin-table-section admin-empty-state">No registrations for this event yet.</div>
      )}

      {stats && !summary.isEmpty && (
        <>
          <div className="admin-stats-columns">
            <BreakdownTable
              title="By category"
              hint="Every entry, by race distance."
              firstColumn="Category"
              rows={byCategory}
            />
            <BreakdownTable
              title="By code"
              hint="Entries that used each discount code."
              firstColumn="Code"
              rows={byCode}
            />
          </div>

          <section className="glass admin-table-section admin-stats-section">
            <div className="admin-stats-section-head">
              <h3>By day</h3>
              <p className="text-muted">
                New entries by the day they were made (Indian time). Status is as it stands now.
              </p>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table admin-stats-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Entries</th>
                    <th scope="col" className="admin-num">Paid</th>
                    <th scope="col" className="admin-num">Pending</th>
                    <th scope="col" className="admin-num">Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map((day) => (
                    <tr key={day.key}>
                      <th scope="row" className="admin-cell-name admin-stats-day">{formatDay(day.key)}</th>
                      <td>
                        <div className="admin-stats-bar-cell">
                          <span className="admin-stats-bar-track" aria-hidden="true">
                            {day.entries > 0 && (
                              <span
                                className="admin-stats-bar"
                                style={{ width: `${(day.entries / maxDayEntries) * 100}%` }}
                              />
                            )}
                          </span>
                          <span className="admin-num admin-stats-strong">{day.entries}</span>
                        </div>
                      </td>
                      <CountCells row={day} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
