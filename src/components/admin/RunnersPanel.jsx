import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Download, Search, Filter } from 'lucide-react';
import { getRunners, describeRunnersError } from '../../utils/services/runners';
import {
  filterRunners, runnerFilterOptions, runnerCsvRows, RUNNER_CSV_HEADER, rowPhone,
} from '../../utils/runnerLookup';
import { downloadCsv } from '../../utils/csv';

// Rendered in steps so a long list stays quick on a phone at the desk.
const STEP = 100;

const formatAmount = (amount) => (amount == null ? '—'
  : new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(amount));

const formatRegistered = (iso) => new Date(iso).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

const entryLabel = (r) => (r.entry_type === 'Group'
  ? `Group${r.group_name ? ` · ${r.group_name}` : ''}`
  : 'Individual');

function StatusBadge({ status }) {
  const cls = status === 'PAID' ? 'admin-badge-paid'
    : status === 'PENDING' ? 'admin-badge-pending'
      : status === 'CANCELLED' ? 'admin-badge-cancelled'
        : 'admin-badge-neutral';
  return <span className={`admin-badge ${cls}`}>{status}</span>;
}

const dash = (v) => (v == null || v === '' ? '—' : v);

/** A full number is a tap-to-call link; a masked one (before 0027) is text. */
function Phone({ row }) {
  const value = rowPhone(row);
  if (!value) return '—';
  if (row.phone == null) return value;
  const dial = value.replace(/[^\d+]/g, '');
  return <a href={`tel:${dial}`} className="admin-runners-tel">{value}</a>;
}

/**
 * A cancelled (or unfinished) attempt by someone who paid in another entry.
 * Without this the row reads as "paid but not registered".
 */
function PaidElsewhere({ row }) {
  if (!row.paid_entry) return null;
  return <span className="admin-runners-paid-note">Registered: {row.paid_entry}</span>;
}

// What each status means, for whoever is answering a runner's question.
const STATUS_LEGEND = [
  ['PAID', 'confirmed'],
  ['PENDING', 'payment not finished yet'],
  ['CANCELLED', "payment didn't complete, slot released"],
  ['REFUNDED', 'money returned'],
];

function StatusLegend() {
  return (
    <div className="admin-runners-legend">
      <ul aria-label="What each payment status means">
        {STATUS_LEGEND.map(([status, meaning]) => (
          <li key={status}>
            <StatusBadge status={status} />{' '}
            <span>= {meaning}</span>
          </li>
        ))}
      </ul>
      <p>
        A CANCELLED row marked <strong>Registered: …</strong> is an earlier attempt by someone who paid in
        that other entry — they are in.
      </p>
      <p>Money deducted but not PAID? Send the Razorpay ID to Papa.</p>
    </div>
  );
}

/**
 * Read-only runner lookup for stats viewers. Data comes from list_runners()
 * (full phone, email masked in the database, no DOB, emergency contact, blood
 * group or medical details) -- or list_registrations_basic() with the phone
 * masked, before migration 0027. There is nothing here that edits anything.
 */
export default function RunnersPanel({ eventId }) {
  const [rows, setRows] = useState([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [visible, setVisible] = useState(STEP);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setIsLoading(true);
    try {
      const data = await getRunners(eventId);
      if (request !== latestRequest.current) return;
      setRows(data);
      setHasLoaded(true);
      setError('');
    } catch (err) {
      if (request !== latestRequest.current) return;
      console.error('Error fetching runner list', err);
      setError(describeRunnersError(err));
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const options = useMemo(() => runnerFilterOptions(rows), [rows]);
  const matches = useMemo(
    () => filterRunners(rows, { query, category, status }),
    [rows, query, category, status],
  );
  const shown = matches.slice(0, visible);
  const hasFullPhones = rows.some((r) => r.phone != null);

  const setFilter = (setter) => (e) => { setter(e.target.value); setVisible(STEP); };

  const handleDownload = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`runners_${eventId}_${date}.csv`, RUNNER_CSV_HEADER, runnerCsvRows(matches));
  };

  return (
    <div className="admin-runners-panel">
      <div className="admin-reg-actions">
        <button className="btn btn-outline admin-action-btn" onClick={load} disabled={isLoading}>
          <RefreshCw size={18} className={isLoading ? 'spin' : ''} aria-hidden="true" />
          <span className="admin-action-label">Refresh</span>
        </button>
        <button className="btn btn-outline admin-action-btn" onClick={handleDownload} disabled={!matches.length}>
          <Download size={18} aria-hidden="true" />
          <span className="admin-action-label">Download CSV</span>
        </button>
      </div>

      {error && <div className="admin-save-msg error" role="alert">{error}</div>}

      <div className="glass admin-table-section">
        <div className="admin-table-header">
          <h3>Runners</h3>
          <div className="admin-filters">
            <div className="admin-search-wrap">
              <Search size={16} className="admin-filter-icon" aria-hidden="true" />
              <input
                type="search"
                placeholder={hasFullPhones ? 'Name, phone, pay ID' : 'Name, phone last 4, pay ID'}
                aria-label={hasFullPhones
                  ? 'Search by name, phone number, or Razorpay payment ID'
                  : 'Search by name, last 4 digits of phone, or Razorpay payment ID'}
                value={query}
                onChange={setFilter(setQuery)}
              />
            </div>
            <div className="admin-select-wrap">
              <Filter size={16} className="admin-filter-icon" aria-hidden="true" />
              <select value={category} onChange={setFilter(setCategory)} aria-label="Category">
                <option value="">All categories</option>
                {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="admin-select-wrap">
              <select value={status} onChange={setFilter(setStatus)} aria-label="Payment status" style={{ paddingLeft: '16px' }}>
                <option value="">All statuses</option>
                {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <p className="admin-runners-count text-muted" role="status">
          {!hasLoaded && isLoading ? 'Loading runners…'
            : `${matches.length.toLocaleString('en-IN')} of ${rows.length.toLocaleString('en-IN')} entries`}
          {' · '}{hasFullPhones ? 'email is partly hidden' : 'phone and email are partly hidden'}
        </p>

        <StatusLegend />

        {hasLoaded && matches.length === 0 && (
          <div className="admin-empty-state">
            {rows.length === 0 ? 'No registrations for this event yet.' : 'No runners match that search.'}
          </div>
        )}

        {shown.length > 0 && (
          <>
            {/* Desktop */}
            <div className="admin-table-desktop">
              <div className="admin-table-wrap">
                <table className="admin-table admin-runners-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Phone</th>
                      <th scope="col">Bib</th>
                      <th scope="col">Status</th>
                      <th scope="col">Category</th>
                      <th scope="col" className="admin-num">Amount</th>
                      <th scope="col">Entry</th>
                      <th scope="col">Code</th>
                      <th scope="col">Razorpay ID</th>
                      <th scope="col">Registered</th>
                      <th scope="col">T-shirt</th>
                      <th scope="col">City</th>
                      <th scope="col">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr key={`${r.registered_at}-${r.bib ?? ''}-${i}`}>
                        <th scope="row" className="admin-cell-name">{dash(r.name)}</th>
                        <td className="admin-runners-mono"><Phone row={r} /></td>
                        <td>{dash(r.bib)}</td>
                        <td>
                          <StatusBadge status={r.payment_status} />
                          <PaidElsewhere row={r} />
                        </td>
                        <td>{dash(r.category)}</td>
                        <td className="admin-num">{formatAmount(r.amount_paid)}</td>
                        <td>{entryLabel(r)}</td>
                        <td>{dash(r.coupon_code)}</td>
                        <td className="admin-runners-mono">{dash(r.razorpay_payment_id)}</td>
                        <td className="admin-cell-muted">{formatRegistered(r.registered_at)}</td>
                        <td>{dash(r.tshirt_size)}</td>
                        <td>{dash(r.city)}</td>
                        <td className="admin-runners-mono">{dash(r.email_masked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Phone */}
            <div className="admin-cards-mobile">
              {shown.map((r, i) => (
                <div key={`${r.registered_at}-${r.bib ?? ''}-${i}`} className="admin-reg-card glass">
                  <div className="admin-reg-card-header">
                    <span className="admin-reg-card-name">{dash(r.name)}</span>
                    <StatusBadge status={r.payment_status} />
                  </div>
                  <PaidElsewhere row={r} />
                  <div className="admin-reg-card-details">
                    <div className="admin-reg-card-row">
                      <span className="admin-reg-card-label">Phone</span>
                      <span className="admin-reg-card-value"><Phone row={r} /></span>
                    </div>
                    {[
                      ['Bib', r.bib],
                      ['Category', r.category],
                      ['Amount', formatAmount(r.amount_paid)],
                      ['Entry', entryLabel(r)],
                      ['Code', r.coupon_code],
                      ['Razorpay ID', r.razorpay_payment_id],
                      ['Registered', formatRegistered(r.registered_at)],
                      ['T-shirt', r.tshirt_size],
                      ['City', r.city],
                      ['Email', r.email_masked],
                    ].map(([label, value]) => (
                      <div key={label} className="admin-reg-card-row">
                        <span className="admin-reg-card-label">{label}</span>
                        <span className="admin-reg-card-value">{dash(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {matches.length > shown.length && (
              <div className="admin-runners-more">
                <button className="btn btn-outline admin-action-btn" onClick={() => setVisible((v) => v + STEP)}>
                  Show {Math.min(STEP, matches.length - shown.length)} more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
