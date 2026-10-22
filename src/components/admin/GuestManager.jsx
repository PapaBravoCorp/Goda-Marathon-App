import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Edit3, ArrowUp, ArrowDown, Eye, EyeOff, AlertTriangle,
  Upload, X, RefreshCw, UserRound,
} from 'lucide-react';
import ContentModal from './ContentModal';
import {
  getAllGuests, addGuest, updateGuest, deleteGuest, reorderGuests,
} from '../../utils/services/guests';
import { uploadGuestPhoto, deleteStoredImageAt, storagePathFromPublicUrl } from '../../utils/services/storage';
import { describeSaveError } from '../../utils/services/errors';
import { resolveImageUrl } from '../../utils/mediaUrl';
import { resizeCover } from '../../utils/resizeCover';

// The homepage card is about 260 px wide; twice that is sharp on a phone.
const PHOTO_WIDTH = 640;
const SHARP_PHOTO_WIDTH = 480;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SOURCE_MB = 40;

const emptyForm = { name: '', credential: '', badge: '', photo_url: '', is_published: true };

function describeLoadError(error) {
  const message = error?.message || '';
  if (/featured_guests/i.test(message) && /does not exist|schema cache/i.test(message)) {
    return 'The guests table does not exist yet. Run supabase/migrations/0020_website_settings.sql in the Supabase SQL editor, then reload this page.';
  }
  return message ? `Could not load guests: ${message}` : 'Could not load guests.';
}

/**
 * Admin -> Website -> Guests of Honour: well-known people shown with their
 * photo on the homepage. Each guest is saved from its own form, like a
 * sponsor, and a hidden guest is not readable by the public at all (0020), so
 * someone not yet confirmed can be prepared in advance.
 */
export default function GuestManager() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [pending, setPending] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await getAllGuests());
      setLoadError('');
    } catch (err) {
      setLoadError(describeLoadError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => {
    if (pending?.previewUrl) URL.revokeObjectURL(pending.previewUrl);
  }, [pending]);

  const onInput = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setError('');
  };

  const startAdd = () => {
    setForm(emptyForm); setPending(null); setEditing(null); setError(''); setShowForm(true);
  };

  const startEdit = (item) => {
    setForm({
      name: item.name || '',
      credential: item.credential || '',
      badge: item.badge || '',
      photo_url: item.photo_url || '',
      is_published: item.is_published !== false,
    });
    setPending(null); setEditing(item); setError(''); setShowForm(true);
  };

  const closeForm = useCallback(() => {
    setShowForm(false); setEditing(null); setPending(null);
  }, []);

  const save = async (e) => {
    e.preventDefault();
    if (isProcessing) return;
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!pending && !form.photo_url) { setError('Add a photo.'); return; }

    setIsSaving(true);
    let uploadedUrl = null;
    try {
      if (pending) uploadedUrl = await uploadGuestPhoto(pending.photo, pending.fileName);

      const payload = {
        name: form.name.trim(),
        credential: form.credential.trim() || null,
        badge: form.badge.trim() || null,
        photo_url: uploadedUrl || form.photo_url,
        is_published: form.is_published,
      };

      if (editing) await updateGuest(editing.id, payload);
      else await addGuest({ ...payload, display_order: items.length });

      // Only once the row points at the new photo is the old one removed.
      if (editing && editing.photo_url !== payload.photo_url) {
        await deleteStoredImageAt(editing.photo_url);
      }

      closeForm();
      setForm(emptyForm);
      await load();
    } catch (err) {
      if (uploadedUrl) await deleteStoredImageAt(uploadedUrl);
      setError(describeSaveError(err, 'guest'));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove ${item.name} from the homepage guests?`)) return;
    try {
      await deleteGuest(item);
      await load();
    } catch (err) { window.alert(describeSaveError(err, 'guest')); }
  };

  const togglePublished = async (item) => {
    try {
      await updateGuest(item.id, { is_published: !item.is_published });
      await load();
    } catch (err) { window.alert(describeSaveError(err, 'guest')); }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    await reorderGuests(next.map(i => i.id));
  };

  if (isLoading) return <div className="admin-empty-state">Loading guests…</div>;

  if (loadError) {
    return (
      <div className="admin-drive-warning">
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>{loadError}</span>
      </div>
    );
  }

  const hiddenCount = items.filter(i => !i.is_published).length;

  return (
    <div>
      <div className="admin-reg-actions" style={{ justifyContent: 'space-between' }}>
        <span className="text-muted" style={{ fontSize: '0.85rem', alignSelf: 'center' }}>
          {items.length} guest{items.length === 1 ? '' : 's'}
          {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
        </span>
        <button type="button" className="btn btn-primary admin-action-btn" onClick={startAdd} style={{ gap: '6px' }}>
          <Plus size={18} /> <span className="admin-action-label">Add Guest</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '2rem 1rem' }}>
          <p>No guests yet. The Guests of Honour band stays hidden on the homepage until you add one.</p>
        </div>
      ) : (
        <div className="admin-content-list">
          {items.map((item, index) => (
            <div key={item.id} className={`admin-content-row admin-sponsor-row glass ${item.is_published ? '' : 'is-hidden'}`}>
              <span className="admin-guest-thumb">
                <img src={resolveImageUrl(item.photo_url, 200)} alt="" loading="lazy" />
              </span>
              <div className="admin-content-main">
                <div className="admin-content-title">
                  {item.name}
                  {item.badge && <span className="admin-content-flag admin-content-flag--featured">{item.badge}</span>}
                  {!item.is_published && <span className="admin-content-flag">Hidden</span>}
                </div>
                <p className="admin-content-body">{item.credential || 'No description line'}</p>
              </div>
              <div className="admin-content-actions">
                <button type="button" className="admin-cat-action-btn" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={14} /></button>
                <button type="button" className="admin-cat-action-btn" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Move down"><ArrowDown size={14} /></button>
                <button type="button" className="admin-cat-action-btn" onClick={() => togglePublished(item)} aria-label={item.is_published ? 'Hide' : 'Publish'}>
                  {item.is_published ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button type="button" className="admin-cat-action-btn" onClick={() => startEdit(item)}><Edit3 size={14} /> Edit</button>
                <button type="button" className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => remove(item)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ContentModal
          title={editing ? `Edit ${editing.name}` : 'Add Guest'}
          error={error}
          isSaving={isSaving}
          onSubmit={save}
          onClose={closeForm}
        >
          <GuestPhotoField
            value={form.photo_url}
            savedValue={editing?.photo_url || ''}
            pending={pending}
            disabled={isSaving}
            onProcessing={setIsProcessing}
            onPending={(next) => { setPending(next); setError(''); }}
          />

          <div className="admin-media-form-grid" style={{ marginTop: '1rem' }}>
            <div className="admin-media-form-group">
              <label htmlFor="guest-name">Name <span className="admin-required">*</span></label>
              <input id="guest-name" name="name" value={form.name} onChange={onInput} placeholder="Full name" />
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="guest-badge">Label on the photo</label>
              <input id="guest-badge" name="badge" value={form.badge} onChange={onInput} placeholder="Chief Guest 2025" maxLength={40} />
              <span className="admin-field-hint">A short orange tag. Leave blank for none.</span>
            </div>
          </div>

          <div className="admin-media-form-group" style={{ marginTop: '0.85rem' }}>
            <label htmlFor="guest-credential">Who they are</label>
            <input id="guest-credential" name="credential" value={form.credential} onChange={onInput} placeholder="Olympic boxer, Arjuna Award winner" maxLength={120} />
            <span className="admin-field-hint">One line under the name.</span>
          </div>

          <div className="admin-event-toggle" style={{ marginTop: '1rem' }}>
            <label className="admin-toggle-label">
              <input type="checkbox" name="is_published" checked={form.is_published} onChange={onInput} className="admin-toggle-checkbox" />
              <span className="admin-toggle-switch"></span>
              <span>{form.is_published ? 'Visible on the site' : 'Hidden until you publish it'}</span>
            </label>
          </div>
        </ContentModal>
      )}
    </div>
  );
}

/* ── Photo picker ─────────────────────────────────────────────────────────── */

/**
 * Like the edition cover picker: a chosen photo is resized in the browser at
 * once but uploaded only on Save. The preview is the homepage card's own
 * portrait crop, so a head cut off here is cut off there too.
 */
function GuestPhotoField({ value, savedValue, pending, disabled, onProcessing, onPending }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const busy = disabled || isProcessing;
  const shown = pending?.previewUrl || (value ? resolveImageUrl(value, 400) : '');
  const isUnsaved = !!pending || (value || '') !== (savedValue || '');

  const handleFile = async (file) => {
    if (!file || busy) return;
    setError('');
    if (!ACCEPTED.includes(file.type)) { setError('Choose a JPG, PNG or WEBP photo.'); return; }
    if (file.size > MAX_SOURCE_MB * 1024 * 1024) {
      setError(`That file is over ${MAX_SOURCE_MB} MB. Export a smaller copy and try again.`);
      return;
    }

    setIsProcessing(true);
    onProcessing(true);
    try {
      const photo = await resizeCover(file, PHOTO_WIDTH);
      onPending({ photo, fileName: file.name, previewUrl: URL.createObjectURL(photo.blob) });
    } catch (err) {
      setError(err.message || 'This photo could not be processed.');
    } finally {
      setIsProcessing(false);
      onProcessing(false);
    }
  };

  let title, detail;
  if (isProcessing) {
    title = <><RefreshCw size={14} className="spin" /> Preparing photo…</>;
  } else if (pending) {
    title = pending.fileName;
    detail = `${pending.photo.width} × ${pending.photo.height} · ${Math.max(1, Math.round(pending.photo.blob.size / 1024))} KB`;
  } else if (value) {
    title = storagePathFromPublicUrl(value)?.split('/').pop() || value;
    detail = 'Current photo';
  } else {
    title = 'No photo yet';
    detail = 'A clear, well-lit photo of their face works best.';
  }

  return (
    <div className="admin-image-field">
      <span className="admin-image-field-label">Photo <span className="admin-required">*</span></span>
      <div
        className={`admin-hero-field ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
      >
        <span className="admin-guest-thumb admin-guest-thumb--large" aria-hidden="true">
          {shown ? <img src={shown} alt="" /> : <UserRound size={28} />}
        </span>

        <div className="admin-hero-field-status" aria-live="polite">
          <span className="admin-hero-field-title" title={typeof title === 'string' ? title : undefined}>{title}</span>
          {detail && <span className="admin-hero-field-detail">{detail}</span>}
          {isUnsaved && !isProcessing && <span className="admin-hero-field-badge">Not saved yet</span>}
        </div>

        <div className="admin-image-preview-actions admin-hero-field-actions">
          <button type="button" className="admin-cat-action-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload size={13} /> {pending || value ? 'Replace' : 'Upload photo'}
          </button>
          {pending && (
            <button type="button" className="admin-cat-action-btn" onClick={() => { onPending(null); setError(''); }} disabled={busy}>
              <X size={13} /> Discard
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="sr-only"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
      />

      {pending && pending.photo.width < SHARP_PHOTO_WIDTH && (
        <div className="admin-hero-field-warning">
          <AlertTriangle size={14} />
          <span>Only {pending.photo.width} px wide, so it may look soft. {SHARP_PHOTO_WIDTH} px or wider is best.</span>
        </div>
      )}
      {error ? (
        <div className="admin-login-error" style={{ marginTop: '0.5rem' }}><span>{error}</span></div>
      ) : (
        <span className="admin-field-hint">
          Shown as a tall portrait (4:5), cropped from the centre and slightly towards the top, so
          a head-and-shoulders photo works best. Resized in your browser and uploaded when you save.
        </span>
      )}
    </div>
  );
}
