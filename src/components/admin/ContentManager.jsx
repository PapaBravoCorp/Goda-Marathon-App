import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Trash2, Edit3, ArrowUp, ArrowDown, Eye, EyeOff,
  HelpCircle, Quote, Star, AlertTriangle
} from 'lucide-react';
import {
  getAllFaqs, addFaq, updateFaq, deleteFaq, reorderFaqs,
  getAllTestimonials, addTestimonial, updateTestimonial, deleteTestimonial, reorderTestimonials,
} from '../../utils/services/content';

const emptyFaq = { question: '', answer: '', is_published: true };
const emptyTestimonial = {
  quote: '', author_name: '', author_role: '', rating: 5, is_published: true,
};

export default function ContentManager() {
  const [view, setView] = useState('faqs');

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Site Content</h3>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`btn ${view === 'faqs' ? 'btn-primary' : 'btn-outline'} admin-action-btn`}
            onClick={() => setView('faqs')}
            style={{ gap: '6px' }}
          >
            <HelpCircle size={18} /> <span className="admin-action-label">FAQ</span>
          </button>
          <button
            className={`btn ${view === 'testimonials' ? 'btn-primary' : 'btn-outline'} admin-action-btn`}
            onClick={() => setView('testimonials')}
            style={{ gap: '6px' }}
          >
            <Quote size={18} /> <span className="admin-action-label">Testimonials</span>
          </button>
        </div>
      </div>

      {view === 'faqs' ? <FaqSection /> : <TestimonialSection />}
    </div>
  );
}

/* ── FAQ ──────────────────────────────────────────────────────────────────── */

function FaqSection() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyFaq);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setItems(await getAllFaqs());
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onInput = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setError('');
  };

  const startAdd = () => {
    setForm(emptyFaq); setEditingId(null); setError(''); setShowForm(true);
  };

  const startEdit = (item) => {
    setForm({
      question: item.question || '',
      answer: item.answer || '',
      is_published: item.is_published !== false,
    });
    setEditingId(item.id); setError(''); setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.question.trim()) { setError('Question is required.'); return; }
    if (!form.answer.trim()) { setError('Answer is required.'); return; }

    setIsSaving(true);
    try {
      const payload = {
        question: form.question.trim(),
        answer: form.answer.trim(),
        is_published: form.is_published,
      };
      if (editingId) await updateFaq(editingId, payload);
      else await addFaq({ ...payload, display_order: items.length });
      setShowForm(false); setEditingId(null); setForm(emptyFaq);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete “${item.question}”?`)) return;
    try { await deleteFaq(item.id); await load(); }
    catch (err) { window.alert(err.message || 'Delete failed.'); }
  };

  const togglePublished = async (item) => {
    try {
      await updateFaq(item.id, { is_published: !item.is_published });
      await load();
    } catch (err) { window.alert(err.message || 'Update failed.'); }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    await reorderFaqs(next.map(i => i.id));
  };

  const hiddenCount = items.filter(i => !i.is_published).length;

  if (isLoading) return <div className="admin-empty-state">Loading FAQ…</div>;

  return (
    <div>
      <div className="admin-reg-actions" style={{ justifyContent: 'space-between' }}>
        <span className="text-muted" style={{ fontSize: '0.85rem', alignSelf: 'center' }}>
          {items.length} question{items.length === 1 ? '' : 's'}
          {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
        </span>
        <button className="btn btn-primary admin-action-btn" onClick={startAdd} style={{ gap: '6px' }}>
          <Plus size={18} /> <span className="admin-action-label">Add Question</span>
        </button>
      </div>

      {hiddenCount > 0 && (
        <div className="admin-drive-warning">
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            {hiddenCount} question{hiddenCount === 1 ? ' is' : 's are'} hidden from visitors. These were
            seeded unpublished because their answers referenced dates or categories that no longer match
            the event — review and publish them.
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <p>No questions yet. The FAQ section is hidden from the landing page until you add one.</p>
        </div>
      ) : (
        <div className="admin-content-list">
          {items.map((item, index) => (
            <div key={item.id} className={`admin-content-row glass ${item.is_published ? '' : 'is-hidden'}`}>
              <div className="admin-content-main">
                <div className="admin-content-title">
                  {item.question}
                  {!item.is_published && <span className="admin-content-flag">Hidden</span>}
                </div>
                <p className="admin-content-body">{item.answer}</p>
              </div>
              <div className="admin-content-actions">
                <button className="admin-cat-action-btn" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={14} /></button>
                <button className="admin-cat-action-btn" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Move down"><ArrowDown size={14} /></button>
                <button className="admin-cat-action-btn" onClick={() => togglePublished(item)} aria-label={item.is_published ? 'Hide' : 'Publish'}>
                  {item.is_published ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button className="admin-cat-action-btn" onClick={() => startEdit(item)}><Edit3 size={14} /> Edit</button>
                <button className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => remove(item)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ContentModal
          title={editingId ? 'Edit Question' : 'Add Question'}
          error={error}
          isSaving={isSaving}
          onSubmit={save}
          onClose={() => { setShowForm(false); setEditingId(null); }}
        >
          <div className="admin-media-form-group">
            <label htmlFor="faq-q">Question <span className="admin-required">*</span></label>
            <input id="faq-q" name="question" value={form.question} onChange={onInput} placeholder="What is the minimum age to participate?" />
          </div>
          <div className="admin-media-form-group" style={{ marginTop: '0.85rem' }}>
            <label htmlFor="faq-a">Answer <span className="admin-required">*</span></label>
            <textarea id="faq-a" name="answer" value={form.answer} onChange={onInput} rows={5} style={{ resize: 'vertical' }} />
          </div>
          <div className="admin-event-toggle" style={{ marginTop: '1rem' }}>
            <label className="admin-toggle-label">
              <input type="checkbox" name="is_published" checked={form.is_published} onChange={onInput} className="admin-toggle-checkbox" />
              <span className="admin-toggle-switch"></span>
              <span>{form.is_published ? 'Visible on the site' : 'Hidden from the site'}</span>
            </label>
          </div>
        </ContentModal>
      )}
    </div>
  );
}

/* ── Testimonials ─────────────────────────────────────────────────────────── */

function TestimonialSection() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyTestimonial);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setItems(await getAllTestimonials());
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onInput = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setError('');
  };

  const startAdd = () => {
    setForm(emptyTestimonial); setEditingId(null); setError(''); setShowForm(true);
  };

  const startEdit = (item) => {
    setForm({
      quote: item.quote || '',
      author_name: item.author_name || '',
      author_role: item.author_role || '',
      rating: item.rating ?? 5,
      is_published: item.is_published !== false,
    });
    setEditingId(item.id); setError(''); setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.quote.trim()) { setError('Quote is required.'); return; }
    if (!form.author_name.trim()) { setError('Author name is required.'); return; }

    setIsSaving(true);
    try {
      const rating = parseInt(form.rating, 10);
      const payload = {
        quote: form.quote.trim(),
        author_name: form.author_name.trim(),
        author_role: form.author_role.trim() || null,
        rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
        is_published: form.is_published,
      };
      if (editingId) await updateTestimonial(editingId, payload);
      else await addTestimonial({ ...payload, display_order: items.length });
      setShowForm(false); setEditingId(null); setForm(emptyTestimonial);
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete the quote from ${item.author_name}?`)) return;
    try { await deleteTestimonial(item.id); await load(); }
    catch (err) { window.alert(err.message || 'Delete failed.'); }
  };

  const togglePublished = async (item) => {
    try {
      await updateTestimonial(item.id, { is_published: !item.is_published });
      await load();
    } catch (err) { window.alert(err.message || 'Update failed.'); }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    await reorderTestimonials(next.map(i => i.id));
  };

  if (isLoading) return <div className="admin-empty-state">Loading testimonials…</div>;

  return (
    <div>
      <div className="admin-reg-actions" style={{ justifyContent: 'space-between' }}>
        <span className="text-muted" style={{ fontSize: '0.85rem', alignSelf: 'center' }}>
          {items.length} quote{items.length === 1 ? '' : 's'}
        </span>
        <button className="btn btn-primary admin-action-btn" onClick={startAdd} style={{ gap: '6px' }}>
          <Plus size={18} /> <span className="admin-action-label">Add Quote</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <p>No testimonials yet.</p>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            The section stays hidden on the landing page until you add a real quote. Only add
            feedback you actually received from a runner.
          </p>
        </div>
      ) : (
        <div className="admin-content-list">
          {items.map((item, index) => (
            <div key={item.id} className={`admin-content-row glass ${item.is_published ? '' : 'is-hidden'}`}>
              <div className="admin-content-main">
                <div className="admin-content-title">
                  {item.author_name}
                  {item.author_role && <span className="text-muted" style={{ fontWeight: 400 }}> — {item.author_role}</span>}
                  {!item.is_published && <span className="admin-content-flag">Hidden</span>}
                </div>
                {item.rating > 0 && (
                  <div className="admin-content-stars">
                    {Array.from({ length: item.rating }).map((_, i) => <Star key={i} size={12} fill="currentColor" />)}
                  </div>
                )}
                <p className="admin-content-body">&ldquo;{item.quote}&rdquo;</p>
              </div>
              <div className="admin-content-actions">
                <button className="admin-cat-action-btn" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={14} /></button>
                <button className="admin-cat-action-btn" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Move down"><ArrowDown size={14} /></button>
                <button className="admin-cat-action-btn" onClick={() => togglePublished(item)} aria-label={item.is_published ? 'Hide' : 'Publish'}>
                  {item.is_published ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button className="admin-cat-action-btn" onClick={() => startEdit(item)}><Edit3 size={14} /> Edit</button>
                <button className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => remove(item)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ContentModal
          title={editingId ? 'Edit Testimonial' : 'Add Testimonial'}
          error={error}
          isSaving={isSaving}
          onSubmit={save}
          onClose={() => { setShowForm(false); setEditingId(null); }}
        >
          <div className="admin-media-form-group">
            <label htmlFor="t-quote">Quote <span className="admin-required">*</span></label>
            <textarea id="t-quote" name="quote" value={form.quote} onChange={onInput} rows={4} style={{ resize: 'vertical' }} placeholder="What the runner actually said." />
          </div>
          <div className="admin-media-form-grid" style={{ marginTop: '0.85rem' }}>
            <div className="admin-media-form-group">
              <label htmlFor="t-name">Name <span className="admin-required">*</span></label>
              <input id="t-name" name="author_name" value={form.author_name} onChange={onInput} placeholder="Runner's name" />
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="t-role">Role / Context</label>
              <input id="t-role" name="author_role" value={form.author_role} onChange={onInput} placeholder="10km finisher, 2025" />
            </div>
          </div>
          <div className="admin-media-form-group" style={{ marginTop: '0.85rem', maxWidth: '200px' }}>
            <label htmlFor="t-rating">Stars</label>
            <select id="t-rating" name="rating" value={form.rating} onChange={onInput}>
              <option value="0">No rating</option>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
            </select>
          </div>
          <div className="admin-event-toggle" style={{ marginTop: '1rem' }}>
            <label className="admin-toggle-label">
              <input type="checkbox" name="is_published" checked={form.is_published} onChange={onInput} className="admin-toggle-checkbox" />
              <span className="admin-toggle-switch"></span>
              <span>{form.is_published ? 'Visible on the site' : 'Hidden from the site'}</span>
            </label>
          </div>
        </ContentModal>
      )}
    </div>
  );
}

/* ── Shared modal shell ───────────────────────────────────────────────────── */

function ContentModal({ title, error, isSaving, onSubmit, onClose, children }) {
  // Mount-only: focus and scroll lock must not re-run on every keystroke.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal admin-modal--wide glass"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="admin-modal-header">
          <h3>{title}</h3>
          <button className="admin-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <form onSubmit={onSubmit} className="admin-modal-form">
          <div className="admin-modal-body">
            <section className="admin-form-section">{children}</section>
            {error && <div className="admin-login-error" style={{ marginTop: '1rem' }}><span>{error}</span></div>}
          </div>
          <div className="admin-modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
