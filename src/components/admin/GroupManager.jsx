import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, ChevronDown, CheckCircle, Clock, XCircle, Tag, Mail, Phone, Loader,
} from 'lucide-react';

import {
  getRegistrationGroups, getGroupMembers, updateGroupPaymentStatus,
} from '../../utils/services/groupRegistrations';
import { describeSaveError } from '../../utils/services/errors';

const formatPrice = (p) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(p) || 0);

const STATUS_ICONS = {
  PAID: CheckCircle,
  PENDING: Clock,
  CANCELLED: XCircle,
};

/**
 * Bulk entries, grouped.
 *
 * The registrations table lists every runner individually, which is right for
 * bib collection and wrong for money: a club that entered twenty people pays
 * once, and confirming that payment twenty rows at a time is both tedious and
 * a reliable way to leave three of them behind.
 */
export default function GroupManager({ eventSlug }) {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedId, setExpandedId] = useState(null);
  const [members, setMembers] = useState({});
  const [loadingMembers, setLoadingMembers] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const loadGroups = useCallback(async () => {
    setIsLoading(true);
    try {
      setGroups(await getRegistrationGroups(eventSlug));
    } catch (err) {
      setError(describeSaveError(err, 'groups'));
    } finally {
      setIsLoading(false);
    }
  }, [eventSlug]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  /** Members are fetched on expand, not up front: forty groups would mean forty
   *  round trips for panels nobody has opened. */
  const toggleExpand = async (group) => {
    if (expandedId === group.id) { setExpandedId(null); return; }
    setExpandedId(group.id);

    if (!members[group.id]) {
      setLoadingMembers(group.id);
      try {
        const rows = await getGroupMembers(group.id);
        setMembers(prev => ({ ...prev, [group.id]: rows }));
      } finally {
        setLoadingMembers(null);
      }
    }
  };

  const setStatus = async (group, status) => {
    const verb = status === 'PAID' ? 'mark as paid' : status === 'CANCELLED' ? 'cancel' : 'set to pending';
    if (!window.confirm(
      `This will ${verb} the whole group "${group.group_code}" — ` +
      `${group.active_count} participant${group.active_count === 1 ? '' : 's'}. Continue?`
    )) return;

    setBusyId(group.id);
    setError('');
    try {
      await updateGroupPaymentStatus(group.id, status);
      // The member list in hand is now stale; drop it so a re-expand refetches.
      setMembers(prev => {
        const next = { ...prev };
        delete next[group.id];
        return next;
      });
      await loadGroups();
    } catch (err) {
      setError(describeSaveError(err, 'group'));
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return <div className="admin-empty-state">Loading groups…</div>;
  }

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Group Entries</h3>
        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
          {groups.length} group{groups.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <div className="admin-login-error" style={{ marginBottom: '1rem' }}>
          <span>{error}</span>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <Users size={32} style={{ opacity: 0.4, marginBottom: '0.75rem' }} />
          <p>
            No group entries yet. Clubs and companies can enter a whole team at
            <code> /register/group</code>.
          </p>
        </div>
      ) : (
        <div className="admin-group-list">
          {groups.map(g => {
            const isOpen = expandedId === g.id;
            const Icon = STATUS_ICONS[g.payment_status] || Clock;
            const rows = members[g.id] || [];
            // participant_count is what was entered; active_count is what is
            // still standing after any individual cancellations.
            const cancelled = g.participant_count - g.active_count;

            return (
              <div key={g.id} className={`admin-group-card glass ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="admin-group-head"
                  onClick={() => toggleExpand(g)}
                  aria-expanded={isOpen}
                >
                  <ChevronDown size={18} className="admin-group-chevron" aria-hidden="true" />

                  <div className="admin-group-id">
                    <span className="admin-group-code">{g.group_code}</span>
                    <span className="admin-group-org">{g.organisation_name || '—'}</span>
                  </div>

                  <div className="admin-group-captain">
                    <span>{g.captain_name}</span>
                    <span className="text-muted">{g.captain_email}</span>
                  </div>

                  <div className="admin-group-count">
                    <Users size={14} aria-hidden="true" />
                    {g.active_count}
                    {cancelled > 0 && (
                      <span className="admin-group-cancelled">+{cancelled} cancelled</span>
                    )}
                  </div>

                  <div className="admin-group-money">
                    <span className="admin-group-total">{formatPrice(g.total)}</span>
                    {Number(g.discount) > 0 && (
                      <span className="admin-group-discount">
                        <Tag size={11} aria-hidden="true" />
                        {g.coupon_code} −{formatPrice(g.discount)}
                      </span>
                    )}
                  </div>

                  <span className={`admin-badge ${
                    g.payment_status === 'PAID' ? 'admin-badge-paid'
                      : g.payment_status === 'CANCELLED' ? 'admin-badge-cancelled'
                      : 'admin-badge-pending'
                  }`}>
                    <Icon size={12} aria-hidden="true" /> {g.payment_status}
                  </span>
                </button>

                {isOpen && (
                  <div className="admin-group-body">
                    <div className="admin-group-contact">
                      <a href={`mailto:${g.captain_email}`}>
                        <Mail size={14} aria-hidden="true" /> {g.captain_email}
                      </a>
                      {g.captain_phone && (
                        <a href={`tel:${g.captain_phone}`}>
                          <Phone size={14} aria-hidden="true" /> {g.captain_phone}
                        </a>
                      )}
                    </div>

                    {loadingMembers === g.id ? (
                      <p className="admin-empty-state">
                        <Loader size={16} className="spin" aria-hidden="true" /> Loading participants…
                      </p>
                    ) : (
                      <div className="admin-table-wrap">
                        <table className="admin-group-table">
                          <thead>
                            <tr>
                              <th scope="col">Bib</th>
                              <th scope="col">Runner</th>
                              <th scope="col">Category</th>
                              <th scope="col">T-Shirt</th>
                              <th scope="col">Blood</th>
                              <th scope="col" className="admin-num">Fee</th>
                              <th scope="col" className="admin-num">Discount</th>
                              <th scope="col" className="admin-num">Payable</th>
                              <th scope="col">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map(r => (
                              <tr key={r.id} className={r.payment_status === 'CANCELLED' ? 'is-cancelled' : ''}>
                                <td><strong>{r.bib}</strong></td>
                                <td>
                                  <span className="admin-group-runner">
                                    {r.first_name} {r.last_name}
                                  </span>
                                  <span className="text-muted">{r.email}</span>
                                </td>
                                <td>{r.category}</td>
                                <td>{r.tshirt_size}</td>
                                <td>{r.blood_group || '—'}</td>
                                <td className="admin-num">{formatPrice(r.list_price ?? r.price)}</td>
                                <td className="admin-num">
                                  {Number(r.discount_amount) > 0 ? `−${formatPrice(r.discount_amount)}` : '—'}
                                </td>
                                <td className="admin-num">{formatPrice(r.price)}</td>
                                <td>{r.payment_status}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={5}>Group total</td>
                              <td className="admin-num">{formatPrice(g.subtotal)}</td>
                              <td className="admin-num">
                                {Number(g.discount) > 0 ? `−${formatPrice(g.discount)}` : '—'}
                              </td>
                              <td className="admin-num"><strong>{formatPrice(g.total)}</strong></td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    <div className="admin-group-actions">
                      <button
                        className="btn btn-primary admin-action-btn"
                        disabled={busyId === g.id || g.payment_status === 'PAID'}
                        onClick={() => setStatus(g, 'PAID')}
                      >
                        <CheckCircle size={16} /> Mark group paid
                      </button>
                      <button
                        className="btn btn-outline admin-action-btn"
                        disabled={busyId === g.id || g.payment_status === 'PENDING'}
                        onClick={() => setStatus(g, 'PENDING')}
                      >
                        <Clock size={16} /> Back to pending
                      </button>
                      <button
                        className="btn btn-outline admin-action-btn admin-danger-btn"
                        disabled={busyId === g.id || g.payment_status === 'CANCELLED'}
                        onClick={() => setStatus(g, 'CANCELLED')}
                      >
                        <XCircle size={16} /> Cancel group
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
