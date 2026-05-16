import React, { useState, useEffect } from 'react';
import { Send, Mail, Clock, Users, Filter, FileText, Eye, CheckCircle, AlertCircle } from 'lucide-react';
import { getRegistrations, sendBulkEmail, getEmailLog, getEventCategories } from '../../utils/storage';

const TEMPLATES = [
  { id: 'confirm', name: 'Registration Confirmation', subject: 'Your Registration is Confirmed! 🏃', body: 'Dear Runner,\n\nThank you for registering for the GODA Epic Trail Run 2026!\n\nYour registration has been received and confirmed. Please keep this email for your records.\n\nSee you at the starting line!\n\nTeam GODA' },
  { id: 'payment', name: 'Payment Reminder', subject: 'Action Required: Complete Your Payment', body: 'Dear Runner,\n\nWe noticed your registration payment is still pending. Please complete your payment to secure your spot.\n\nSlots are filling up fast!\n\nTeam GODA' },
  { id: 'raceday', name: 'Race Day Information', subject: 'Race Day Info — Everything You Need to Know', body: 'Dear Runner,\n\nThe big day is almost here! Here\'s what you need to know:\n\n📍 Venue: Palmstays, Nagalwadi, Girnare, Nashik\n⏰ Assembly: 6:00 AM\n👕 Bib Collection: Decathlon Nashik\n\nPlease arrive early and stay hydrated!\n\nTeam GODA' },
  { id: 'update', name: 'General Update', subject: 'Important Update from GODA Trail Run', body: 'Dear Runner,\n\n[Your message here]\n\nTeam GODA' },
];

export default function NotificationsManager({ eventId }) {
  const [categories, setCategories] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [emailLog, setEmailLog] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [activeView, setActiveView] = useState('compose');

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('all');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => { loadData(); }, [eventId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [regs, cats, log] = await Promise.all([
        getRegistrations(eventId),
        getEventCategories(eventId),
        getEmailLog()
      ]);
      setRegistrations(regs);
      setCategories(cats);
      setEmailLog(log);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const getRecipientCount = () => {
    let recipients = registrations.filter(r => r.payment_status !== 'CANCELLED');
    if (recipientFilter === 'category' && filterCategory) {
      recipients = recipients.filter(r => r.category === filterCategory);
    } else if (recipientFilter === 'status' && filterStatus) {
      recipients = recipients.filter(r => r.payment_status === filterStatus);
    }
    return recipients.length;
  };

  const applyTemplate = (templateId) => {
    const t = TEMPLATES.find(t => t.id === templateId);
    if (t) { setSubject(t.subject); setBody(t.body); }
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      setSendResult({ type: 'error', message: 'Subject and body are required.' });
      return;
    }
    const count = getRecipientCount();
    if (count === 0) {
      setSendResult({ type: 'error', message: 'No recipients match the current filter.' });
      return;
    }
    if (!window.confirm(`Send this email to ${count} recipient(s)?`)) return;

    setIsSending(true);
    setSendResult(null);
    try {
      await sendBulkEmail({
        subject, body,
        recipientFilter: { type: recipientFilter, category: filterCategory, status: filterStatus },
        recipientCount: count
      });
      setSendResult({ type: 'success', message: `Email queued for ${count} recipient(s)!` });
      setSubject(''); setBody('');
      await loadData();
    } catch (err) {
      setSendResult({ type: 'error', message: 'Failed to send. Email has been logged.' });
    } finally {
      setIsSending(false);
    }
  };

  const categoryOptions = categories.length > 0
    ? categories.map(c => c.name)
    : [...new Set(registrations.map(r => r.category))];

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Email Notifications</h3>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className={`btn ${activeView === 'compose' ? 'btn-primary' : 'btn-outline'} admin-action-btn`} onClick={() => setActiveView('compose')} style={{ gap: '6px' }}>
            <Mail size={18} /> <span className="admin-action-label">Compose</span>
          </button>
          <button className={`btn ${activeView === 'log' ? 'btn-primary' : 'btn-outline'} admin-action-btn`} onClick={() => setActiveView('log')} style={{ gap: '6px' }}>
            <Clock size={18} /> <span className="admin-action-label">Sent Log</span>
          </button>
        </div>
      </div>

      {activeView === 'compose' && (
        <div className="admin-email-composer glass" style={{ padding: '1.5rem', borderRadius: '14px' }}>
          {/* Template Selector */}
          <div className="admin-media-form-group" style={{ marginBottom: '1rem' }}>
            <label><FileText size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Load Template</label>
            <select onChange={e => applyTemplate(e.target.value)} defaultValue="">
              <option value="" disabled>Choose a template...</option>
              {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Recipient Filter */}
          <div className="admin-email-recipients glass" style={{ padding: '1rem', borderRadius: '10px', marginBottom: '1rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={14} /> Recipients
            </label>
            <div className="admin-media-form-grid" style={{ marginTop: '0.5rem' }}>
              <div className="admin-media-form-group">
                <label>Filter By</label>
                <select value={recipientFilter} onChange={e => setRecipientFilter(e.target.value)}>
                  <option value="all">All Registrants</option>
                  <option value="category">By Category</option>
                  <option value="status">By Payment Status</option>
                </select>
              </div>
              {recipientFilter === 'category' && (
                <div className="admin-media-form-group">
                  <label>Category</label>
                  <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                    <option value="">Select...</option>
                    {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {recipientFilter === 'status' && (
                <div className="admin-media-form-group">
                  <label>Status</label>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">Select...</option>
                    <option value="PAID">Paid</option>
                    <option value="PENDING">Pending</option>
                  </select>
                </div>
              )}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-primary)', fontWeight: 600 }}>
              {getRecipientCount()} recipient(s) will receive this email
            </div>
          </div>

          {/* Subject & Body */}
          <div className="admin-media-form-group" style={{ marginBottom: '0.75rem' }}>
            <label>Subject *</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject line..." />
          </div>
          <div className="admin-media-form-group" style={{ marginBottom: '1rem' }}>
            <label>Message Body *</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} style={{ resize: 'vertical', width: '100%', padding: '12px 16px', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', color: 'var(--color-text-main)', fontFamily: 'var(--font-family)', fontSize: '0.9rem', lineHeight: 1.6 }} placeholder="Write your message here..." />
          </div>

          {sendResult && (
            <div className={`admin-save-msg ${sendResult.type}`} style={{ marginBottom: '1rem' }}>
              {sendResult.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              {sendResult.message}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline admin-action-btn" onClick={() => setShowPreview(true)} disabled={!subject && !body} style={{ gap: '6px' }}>
              <Eye size={18} /> Preview
            </button>
            <button className="btn btn-primary admin-action-btn" onClick={handleSend} disabled={isSending} style={{ gap: '6px' }}>
              <Send size={18} /> {isSending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="admin-modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="admin-modal glass" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="admin-modal-header">
              <h3>Email Preview</h3>
              <button className="admin-modal-close" onClick={() => setShowPreview(false)}>×</button>
            </div>
            <div className="admin-modal-body" style={{ padding: '1.5rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '1.25rem' }}>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Subject:</p>
                <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '1rem' }}>{subject || '(no subject)'}</p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Body:</p>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: '0.9rem' }}>{body || '(empty)'}</div>
              </div>
              <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                This email will be sent to {getRecipientCount()} recipient(s).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Email Log */}
      {activeView === 'log' && (
        <div className="glass" style={{ padding: '1.5rem', borderRadius: '14px' }}>
          {isLoading ? (
            <div className="admin-empty-state">Loading log...</div>
          ) : emailLog.length === 0 ? (
            <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
              <p>No emails sent yet.</p>
            </div>
          ) : (
            <div className="admin-email-log">
              {emailLog.map(entry => (
                <div key={entry.id} className="admin-email-log-item">
                  <div className="admin-email-log-header">
                    <span className="admin-email-log-subject">{entry.subject}</span>
                    <span className="admin-badge admin-badge-paid">{entry.recipient_count} sent</span>
                  </div>
                  <div className="admin-email-log-meta">
                    <span><Clock size={12} /> {new Date(entry.sent_at).toLocaleString()}</span>
                    {entry.filter_criteria && (
                      <span><Filter size={12} /> {entry.filter_criteria.type || 'all'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
