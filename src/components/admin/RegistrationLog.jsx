import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Filter, RefreshCw, AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Copy, CheckCircle, Monitor,
} from 'lucide-react';
import { getRegistrationLog } from '../../utils/services/registrationLog';

/**
 * Admin -> Activity: every registration attempt, as the runner's browser saw
 * it (migration 0025). A failed registration leaves nothing in the
 * Registrations tab -- its transaction rolls back -- so this is the only place
 * an organiser can see that someone tried, what they were told, and the raw
 * database error behind it.
 *
 * "Needs follow-up" lists people whose latest attempt failed and who still
 * have no live entry: the ones to call.
 */

const PAGE = 50;

const FILTERS = [
  { id: 'all', label: 'All', params: {} },
  { id: 'stuck', label: 'Needs follow-up', params: { stuckOnly: true } },
  { id: 'failed', label: 'Failed', params: { status: 'FAILED' } },
  { id: 'ok', label: 'Succeeded', params: { status: 'OK' } },
  { id: 'abandoned', label: 'Abandoned', params: { status: 'ABANDONED' } },
];

const STAGES = {
  DETAILS: 'Details step',
  SUBMIT: 'Submit',
  PAYMENT: 'Payment',
  CANCEL: 'Cancel reservation',
};

const STATUS_BADGES = {
  OK: { cls: 'admin-badge-paid', label: 'OK' },
  FAILED: { cls: 'admin-badge-cancelled', label: 'Failed' },
  ABANDONED: { cls: 'admin-badge-pending', label: 'Abandoned' },
  INFO: { cls: 'admin-badge-neutral', label: 'Info' },
};

/** Plain words for the codes the forms send. Anything else shows as-is. */
const CODE_LABELS = {
  EMAIL_TAKEN: 'Stopped: email already registered',
  PENDING: 'Saved, awaiting payment',
  PAID: 'Paid',
  UNKNOWN: 'Unexpected database error',
  NOT_DEPLOYED: 'Database function missing',
  ALREADY_REGISTERED: 'Email already registered',
  CATEGORY_FULL: 'Category full',
  CATEGORY_UNAVAILABLE: 'Category not open',
  CATEGORY_NOT_FOUND: 'Category no longer exists',
  REGISTRATION_CLOSED: 'Registration closed',
  UNDER_MIN_AGE: 'Under minimum age',
  CHECKOUT_CLOSED: 'Closed the payment window',
  DECLINED: 'Payment declined',
  PROCESSING: 'Payment processing (UPI)',
  UNVERIFIED: 'Paid but not verified — check Razorpay',
  REFUND_REQUIRED: 'Paid but entry could not take it — refund',
  EXPIRED: 'Reservation expired',
  NOT_PAYABLE: 'Reservation no longer payable',
  CHECKOUT_DID_NOT_START: 'Payment window did not open',
  ONLINE_PAYMENT_OFF: 'Online payment switched off',
  RUNNER_CANCELLED: 'Runner cancelled the reservation',
  PAID_BEFORE_CANCEL: 'Cancel pressed, but payment had landed',
};

const when = (iso) => iso
  ? new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  : '';

const money = (n) => (n == null ? '' : `₹${Number(n).toLocaleString('en-IN')}`);

const fullName = (r) => [r.first_name, r.last_name].filter(Boolean).join(' ');

/** "Chrome on Android" from a user agent, enough to spot a pattern. */
function device(ua) {
  if (!ua) return '';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser = /FBAN|FBAV|Instagram/.test(ua) ? 'in-app browser'
    : /WhatsApp/.test(ua) ? 'WhatsApp browser'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${browser} on ${os}`;
}

function Details({ row, onSameBrowser }) {
  const fields = [
    ['Runner was shown', row.shown_message],
    ['Error', row.error_message],
    ['Database code', row.error_sqlstate],
    ['Database detail', row.error_details],
    ['Hint', row.error_hint],
    ['Phone', row.phone],
    ['Categories', row.category],
    ['Participants', row.participant_count],
    ['Amount', money(row.amount)],
    ['Registration id', row.registration_id],
    ['Group id', row.group_id],
    ['Browser time', row.client_at && row.client_at !== row.created_at ? when(row.client_at) : ''],
    ['Device', row.user_agent],
    ['Page', row.page],
    ['Extra', row.context && Object.keys(row.context).length ? JSON.stringify(row.context) : ''],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <div className="admin-activity-details">
      <dl>
        {fields.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd>{String(v)}</dd>
          </React.Fragment>
        ))}
      </dl>
      {row.client_id && (
        <button className="admin-cat-action-btn" onClick={() => onSameBrowser(row.client_id)}>
          <Monitor size={12} /> Everything from this browser
        </button>
      )}
    </div>
  );
}

export default function RegistrationLog({ eventId }) {
  const [filter, setFilter] = useState('all');
  const [stage, setStage] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');          // debounced search
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isMore, setIsMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useCallback(() => ({
    ...(FILTERS.find(f => f.id === filter)?.params || {}),
    stage: stage || null,
    search: query || null,
  }), [filter, stage, query]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const res = await getRegistrationLog(eventId, { ...params(), limit: PAGE, offset: 0 });
      if (id !== requestId.current) return;
      setRows(res.rows || []);
      setTotal(res.total || 0);
      setSummary(res.summary || {});
      setLoadError('');
    } catch (err) {
      if (id !== requestId.current) return;
      setLoadError(err.message || 'Could not load the activity log.');
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [eventId, params]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setIsMore(true);
    try {
      const res = await getRegistrationLog(eventId, { ...params(), limit: PAGE, offset: rows.length });
      setRows(prev => [...prev, ...(res.rows || [])]);
      setTotal(res.total || 0);
    } catch (err) {
      setNotice({ type: 'error', message: err.message });
    } finally {
      setIsMore(false);
    }
  };

  const copyStuck = async () => {
    try {
      const res = await getRegistrationLog(eventId, { stuckOnly: true, limit: 500 });
      const lines = (res.rows || []).map(r =>
        [fullName(r), r.email, r.phone, CODE_LABELS[r.code] || r.code, when(r.created_at)]
          .filter(Boolean).join('\t'));
      await navigator.clipboard.writeText(['Name\tEmail\tPhone\tLast problem\tWhen', ...lines].join('\n'));
      setNotice({ type: 'success', message: `Copied ${lines.length} ${lines.length === 1 ? 'person' : 'people'} — paste into a spreadsheet or message.` });
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Could not copy.' });
    }
  };

  const showBrowser = (clientId) => {
    setFilter('all');
    setStage('');
    setSearch(clientId);
    setOpenId(null);
  };

  if (loadError) {
    return (
      <div className="glass" style={{ padding: '1.5rem', borderRadius: '14px' }}>
        <div className="admin-save-msg error"><AlertCircle size={16} /> {loadError}</div>
      </div>
    );
  }

  return (
    <div className="glass" style={{ padding: '1.5rem', borderRadius: '14px' }}>
      <p className="admin-field-hint" style={{ marginTop: 0 }}>
        Every attempt to register, as the runner&apos;s browser saw it: submits that worked or failed (with the
        database&apos;s own error), payment results, cancelled reservations, and people stopped because their
        email was already taken. A failed attempt never reaches the Registrations tab, so this is where it shows.
      </p>

      {summary.stuck > 0 && (
        <div className="admin-save-msg error">
          <AlertTriangle size={16} />
          <span>
            {summary.stuck} {summary.stuck === 1 ? 'person has' : 'people have'} a failed attempt and still no
            entry. See &ldquo;Needs follow-up&rdquo;.
          </span>
        </div>
      )}
      {notice && (
        <div className={`admin-save-msg ${notice.type}`}>
          {notice.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          <span>{notice.message}</span>
        </div>
      )}

      <div className="admin-delivery-toolbar">
        <button className="btn btn-outline admin-action-btn" onClick={() => load()} disabled={isLoading} style={{ gap: '6px' }} aria-label="Refresh">
          <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
          <span className="admin-action-label">Refresh</span>
        </button>
        {summary.stuck > 0 && (
          <button className="btn btn-outline admin-action-btn" onClick={copyStuck} style={{ gap: '6px' }}>
            <Copy size={16} /> <span>Copy people to follow up</span>
          </button>
        )}
      </div>

      <div className="admin-chip-row" role="tablist" aria-label="Filter by outcome">
        {FILTERS.map(f => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`admin-chip ${filter === f.id ? 'is-on' : ''} ${f.id === 'stuck' && summary.stuck ? 'admin-chip-alert' : ''}`}
            onClick={() => { setFilter(f.id); setOpenId(null); }}
          >
            {f.label}
            {f.id === 'stuck' && summary.stuck ? ` ${summary.stuck}` : ''}
            {f.id === 'failed' && summary.failed ? ` ${summary.failed}` : ''}
          </button>
        ))}
      </div>
      <p className="admin-field-hint" style={{ margin: '0 0 0.75rem' }}>
        Last 24 hours: {summary.ok_24h || 0} successful {summary.ok_24h === 1 ? 'submit' : 'submits'},{' '}
        {summary.failed_24h || 0} {summary.failed_24h === 1 ? 'failure' : 'failures'}.
      </p>

      <div className="admin-delivery-filters">
        <div className="admin-search-wrap">
          <Search size={16} className="admin-filter-icon" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone, code or error"
            aria-label="Search the activity log"
          />
        </div>
        <div className="admin-select-wrap">
          <Filter size={16} className="admin-filter-icon" />
          <select value={stage} onChange={e => setStage(e.target.value)} aria-label="Filter by step">
            <option value="">All steps</option>
            {Object.entries(STAGES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="admin-empty-state">Loading activity…</div>
      ) : rows.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <p>
            {filter === 'all' && !stage && !query
              ? 'Nothing logged yet. Activity appears here as soon as someone uses the registration form.'
              : 'Nothing matches these filters.'}
          </p>
        </div>
      ) : (
        <div className="admin-email-log">
          {rows.map(row => {
            const badge = STATUS_BADGES[row.status] || STATUS_BADGES.INFO;
            const name = fullName(row);
            const isOpen = openId === row.id;
            return (
              <div key={row.id} className="admin-email-log-item">
                <div className="admin-email-log-header">
                  <span className="admin-email-log-subject">
                    {name || row.email || 'Unknown runner'}
                    {name && row.email && <span className="admin-delivery-address"> {row.email}</span>}
                  </span>
                  <span className={`admin-badge ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="admin-email-log-meta admin-delivery-meta">
                  <span>{when(row.created_at)}</span>
                  <span>{row.flow === 'GROUP' ? 'Group' : 'Solo'} · {STAGES[row.stage] || row.stage}</span>
                  {row.code && <span>{CODE_LABELS[row.code] || row.code}</span>}
                  {row.category && <span>{row.category}</span>}
                  {row.amount != null && <span>{money(row.amount)}</span>}
                  {row.user_agent && <span>{device(row.user_agent)}</span>}
                  {row.status === 'FAILED' && row.email && (
                    <span className={`admin-badge ${row.has_live_entry ? 'admin-badge-paid' : 'admin-badge-cancelled'}`}>
                      {row.has_live_entry ? 'Has an entry now' : 'No entry yet'}
                    </span>
                  )}
                </div>
                {(row.error_message || row.shown_message) && row.status !== 'OK' && (
                  <div className={`admin-delivery-error ${row.status === 'FAILED' ? '' : 'is-info'}`}>
                    {row.error_message || row.shown_message}
                    {row.error_details && <> — {row.error_details}</>}
                  </div>
                )}
                <div className="admin-delivery-actions">
                  <button className="admin-cat-action-btn" onClick={() => setOpenId(isOpen ? null : row.id)} aria-expanded={isOpen}>
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {isOpen ? 'Hide details' : 'Details'}
                  </button>
                </div>
                {isOpen && <Details row={row} onSameBrowser={showBrowser} />}
              </div>
            );
          })}
          {rows.length < total && (
            <button className="btn btn-outline admin-page-btn" onClick={loadMore} disabled={isMore} style={{ alignSelf: 'center' }}>
              {isMore ? 'Loading…' : `Show ${Math.min(PAGE, total - rows.length)} more of ${total - rows.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
