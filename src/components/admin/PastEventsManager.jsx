import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, X, Trash2, Edit3, Upload, Link2, Video, Image as ImageIcon,
  ArrowUp, ArrowDown, AlertTriangle, Eye, EyeOff, CalendarDays, ChevronLeft
} from 'lucide-react';
import {
  getAllPastEventRecords, addPastEvent, updatePastEvent, deletePastEvent
} from '../../utils/services/pastEvents';
import {
  getPastEventMedia, addPastEventMedia, addPastEventMediaBulk,
  updatePastEventMedia, deletePastEventMedia, reorderPastEventMedia, syncMediaEventInfo
} from '../../utils/services/media';
import { uploadMedia, validateFile, bucketExists } from '../../utils/services/storage';
import { normalizeMediaUrl, resolveImageUrl, isHotlinkedDrive, getYouTubeId } from '../../utils/mediaUrl';
import ImageUploadField from './ImageUploadField';
import { formatDisplayDate, toInputDate, sanitizeYear } from '../../utils/dates';

const emptyEvent = {
  year: '', title: '', edition_label: '', event_date: '', location: '',
  participants: '', description: '', cover_image: '',
  display_order: 0, is_published: true,
};

export default function PastEventsManager() {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [eventForm, setEventForm] = useState(emptyEvent);
  const [eventError, setEventError] = useState('');
  const [isSavingEvent, setIsSavingEvent] = useState(false);

  const [media, setMedia] = useState([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlCaption, setUrlCaption] = useState('');
  const [urlType, setUrlType] = useState('image');
  const [urlError, setUrlError] = useState('');
  const [storageReady, setStorageReady] = useState(true);
  const fileInputRef = useRef(null);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setEvents(await getAllPastEventRecords());
    setIsLoading(false);
  }, []);

  const loadMedia = useCallback(async (pastEventId) => {
    setIsLoadingMedia(true);
    setMedia(await getPastEventMedia(pastEventId));
    setIsLoadingMedia(false);
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { bucketExists().then(setStorageReady); }, []);

  useEffect(() => {
    if (selected?.id) loadMedia(selected.id);
    else setMedia([]);
  }, [selected, loadMedia]);

  /* ── Edition CRUD ───────────────────────────────────────────── */

  const startAddEvent = () => {
    setEventForm({ ...emptyEvent, display_order: events.length });
    setEditingEventId(null);
    setEventError('');
    setShowEventForm(true);
  };

  const startEditEvent = (ev) => {
    setEventForm({
      year: ev.year || '', title: ev.title || '', edition_label: ev.edition_label || '',
      event_date: toInputDate(ev.event_date),
      location: ev.location || '', participants: ev.participants || '',
      description: ev.description || '', cover_image: ev.cover_image || '',
      display_order: ev.display_order ?? 0, is_published: ev.is_published !== false,
    });
    setEditingEventId(ev.id);
    setEventError('');
    setShowEventForm(true);
  };

  const handleEventInput = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    const next = type === 'checkbox' ? checked : (name === 'year' ? sanitizeYear(value) : value);
    setEventForm(prev => ({ ...prev, [name]: next }));
    setEventError('');
  }, []);

  const setCoverImage = useCallback((url) => {
    setEventForm(prev => ({ ...prev, cover_image: url }));
    setEventError('');
  }, []);

  // Stable identity: the modal's Esc-key effect depends on it.
  const closeEventForm = useCallback(() => {
    setShowEventForm(false);
    setEditingEventId(null);
  }, []);

  // True when another edition already occupies the year being typed — drives a
  // nudge to add a distinguishing label. Not an error: same-year editions are
  // legitimate (2025 had two).
  const yearHasSibling = events.some(
    ev => ev.id !== editingEventId && ev.year === eventForm.year.trim() && eventForm.year.trim() !== ''
  );

  const saveEvent = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(eventForm.year.trim())) { setEventError('Enter a four-digit year, e.g. 2025.'); return; }
    if (!eventForm.title.trim()) { setEventError('Title is required.'); return; }

    setIsSavingEvent(true);
    try {
      const payload = {
        year: eventForm.year.trim(),
        title: eventForm.title.trim(),
        edition_label: eventForm.edition_label.trim() || null,
        event_date: eventForm.event_date.trim() || null,
        location: eventForm.location.trim() || null,
        participants: eventForm.participants.trim() || null,
        description: eventForm.description.trim() || null,
        cover_image: eventForm.cover_image.trim() || null,
        display_order: parseInt(eventForm.display_order) || 0,
        is_published: eventForm.is_published,
      };

      if (editingEventId) {
        const previous = events.find(ev => ev.id === editingEventId);
        await updatePastEvent(editingEventId, payload);
        // Photos stay attached via past_event_id; this only refreshes the
        // denormalised year/title copies used by the admin listing.
        if (previous && (previous.year !== payload.year || previous.title !== payload.title)) {
          await syncMediaEventInfo(editingEventId, payload.year, payload.title);
        }
        if (selected?.id === editingEventId) {
          setSelected(prev => ({ ...prev, ...payload }));
        }
      } else {
        await addPastEvent(payload);
      }

      setShowEventForm(false);
      setEditingEventId(null);
      setEventForm(emptyEvent);
      await loadEvents();
    } catch (err) {
      setEventError(err.message || 'Failed to save. Please try again.');
    } finally {
      setIsSavingEvent(false);
    }
  };

  const removeEvent = async (ev) => {
    if (!window.confirm(`Delete the ${ev.year} edition "${ev.title}"? Its gallery entries are removed too. Uploaded image files stay in storage.`)) return;
    try {
      await deletePastEvent(ev.id);
      if (selected?.id === ev.id) setSelected(null);
      await loadEvents();
    } catch (err) {
      window.alert(err.message || 'Delete failed.');
    }
  };

  /* ── Media: upload ──────────────────────────────────────────── */

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !selected) return;

    setUrlError('');
    const rejected = [];
    const accepted = [];
    files.forEach(f => {
      const problem = validateFile(f);
      if (problem) rejected.push(problem); else accepted.push(f);
    });

    setUploadQueue(accepted.map(f => ({ name: f.name, status: 'pending' })));
    if (rejected.length) setUrlError(rejected.join('\n'));

    const uploaded = [];
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      setUploadQueue(q => q.map((item, idx) => idx === i ? { ...item, status: 'uploading' } : item));
      try {
        const { publicUrl, storagePath, mediaType } = await uploadMedia(file, selected.year);
        uploaded.push({
          pastEventId: selected.id,
          eventYear: selected.year,
          eventTitle: selected.title,
          mediaType,
          url: publicUrl,
          storagePath,
          caption: '',
          displayOrder: media.length + uploaded.length,
        });
        setUploadQueue(q => q.map((item, idx) => idx === i ? { ...item, status: 'done' } : item));
      } catch (err) {
        setUploadQueue(q => q.map((item, idx) =>
          idx === i ? { ...item, status: 'error', message: err.message } : item));
      }
    }

    if (uploaded.length) {
      try {
        await addPastEventMediaBulk(uploaded);
        await loadMedia(selected.id);
      } catch (err) {
        setUrlError(err.message || 'Files uploaded but could not be saved to the gallery.');
      }
    }
    setTimeout(() => setUploadQueue([]), 2500);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  /* ── Media: paste a URL ─────────────────────────────────────── */

  const addUrl = async (e) => {
    e.preventDefault();
    setUrlError('');
    if (!selected) return;

    const result = normalizeMediaUrl(urlInput, urlType);
    if (!result.ok) { setUrlError(result.error); return; }

    try {
      await addPastEventMedia({
        pastEventId: selected.id,
        eventYear: selected.year,
        eventTitle: selected.title,
        mediaType: urlType,
        url: result.url,
        caption: urlCaption,
        displayOrder: media.length,
      });
      setUrlInput('');
      setUrlCaption('');
      await loadMedia(selected.id);
    } catch (err) {
      setUrlError(err.message || 'Could not add that URL.');
    }
  };

  /* ── Media: edit / order / delete ───────────────────────────── */

  const saveCaption = async (item, caption) => {
    if (caption === (item.caption || '')) return;
    try {
      await updatePastEventMedia(item.id, { caption });
      setMedia(m => m.map(x => x.id === item.id ? { ...x, caption } : x));
    } catch {
      // Leave the field as typed; the next reload shows the stored value.
    }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    [next[index], next[target]] = [next[target], next[index]];
    setMedia(next);
    await reorderPastEventMedia(next.map(m => m.id));
  };

  const removeMedia = async (item) => {
    if (!window.confirm('Delete this item? If it was uploaded here, the file is removed too.')) return;
    try {
      await deletePastEventMedia(item.id, item.storage_path);
      await loadMedia(selected.id);
    } catch (err) {
      window.alert(err.message || 'Delete failed.');
    }
  };

  /* ── Render ─────────────────────────────────────────────────── */

  if (isLoading) return <div className="admin-empty-state">Loading past events…</div>;

  if (selected) {
    const driveCount = media.filter(m => isHotlinkedDrive(m.url)).length;

    return (
      <div>
        <div className="admin-media-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <button className="admin-cat-action-btn" onClick={() => setSelected(null)}>
              <ChevronLeft size={14} /> All Editions
            </button>
            <h3 style={{ margin: 0, minWidth: 0 }}>{selected.year}{selected.edition_label ? ` · ${selected.edition_label}` : ''} — {selected.title}</h3>
          </div>
          <button className="btn btn-outline admin-action-btn" onClick={() => startEditEvent(selected)} style={{ gap: '6px' }}>
            <Edit3 size={16} /> <span className="admin-action-label">Edit Details</span>
          </button>
        </div>

        {!storageReady && (
          <div className="admin-save-msg error" style={{ alignItems: 'flex-start' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Storage bucket <strong>past-events</strong> is missing, so uploads will fail.
              Run migration 0003_past_events.sql. You can still add photos by URL below.
            </span>
          </div>
        )}

        <div
          className={`admin-dropzone ${isDragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
          role="button"
          tabIndex={0}
          aria-label="Upload photos"
        >
          <Upload size={26} />
          <p className="admin-dropzone-title">Drop photos here, or click to browse</p>
          <p className="admin-dropzone-hint">JPG, PNG, WEBP, GIF or MP4 · up to 10 MB each · select many at once</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
            className="sr-only"
          />
        </div>

        {uploadQueue.length > 0 && (
          <div className="admin-upload-queue">
            {uploadQueue.map((item, i) => (
              <div key={i} className={`admin-upload-row is-${item.status}`}>
                <span className="admin-upload-name">{item.name}</span>
                <span className="admin-upload-status">
                  {item.status === 'done' ? 'Uploaded'
                    : item.status === 'uploading' ? 'Uploading…'
                      : item.status === 'error' ? (item.message || 'Failed')
                        : 'Queued'}
                </span>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addUrl} className="admin-media-form glass" style={{ marginTop: '1rem' }}>
          <h4 className="admin-form-section-title" style={{ marginTop: 0 }}>
            <Link2 size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Or add by URL
          </h4>
          <div className="admin-media-form-grid">
            <div className="admin-media-form-group">
              <label htmlFor="pe-url-type">Type</label>
              <select id="pe-url-type" value={urlType} onChange={e => setUrlType(e.target.value)}>
                <option value="image">Image</option>
                <option value="video">Video (YouTube or MP4)</option>
              </select>
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="pe-url-caption">Caption</label>
              <input id="pe-url-caption" value={urlCaption} onChange={e => setUrlCaption(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="pe-url">URL</label>
            <input
              id="pe-url"
              value={urlInput}
              onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
              placeholder="https://drive.google.com/file/d/…/view   or   https://youtu.be/…"
            />
            <span className="admin-field-hint">
              Google Drive file links are converted automatically. Folder links cannot work — share each photo
              individually, or upload above.
            </span>
          </div>
          {urlError && (
            <div className="admin-login-error" style={{ marginTop: '0.75rem', whiteSpace: 'pre-line' }}>
              <span>{urlError}</span>
            </div>
          )}
          <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>Add URL</button>
        </form>

        {driveCount > 0 && (
          <div className="admin-drive-warning">
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              {driveCount} item{driveCount === 1 ? ' is' : 's are'} served from Google Drive. Google throttles
              hotlinked images, so these can intermittently fail to load. Upload them here before any public demo.
            </span>
          </div>
        )}

        <h4 className="admin-form-section-title" style={{ marginTop: '1.5rem' }}>
          Gallery — {media.length} item{media.length === 1 ? '' : 's'}
        </h4>

        {isLoadingMedia ? (
          <div className="admin-empty-state">Loading gallery…</div>
        ) : media.length === 0 ? (
          <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
            <p>No photos yet for {selected.year}. Upload some above.</p>
          </div>
        ) : (
          <div className="admin-media-grid">
            {media.map((item, index) => (
              <div key={item.id} className="admin-media-card glass">
                <div className="admin-media-preview">
                  {item.media_type === 'image' ? (
                    <img
                      src={resolveImageUrl(item.url, 400)}
                      alt={item.caption || 'Gallery item'}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.parentElement?.querySelector('.admin-media-broken');
                        if (fallback) fallback.hidden = false;
                      }}
                    />
                  ) : (
                    <div className="admin-media-video-badge">
                      <Video size={24} />
                      <span>{getYouTubeId(item.url) ? 'YouTube' : 'Video'}</span>
                    </div>
                  )}
                  <div className="admin-media-broken" hidden>
                    <AlertTriangle size={18} />
                    <span>Failed to load</span>
                  </div>
                </div>

                <div className="admin-media-info">
                  <div className="admin-media-meta">
                    <span className={`admin-badge ${item.media_type === 'image' ? 'admin-badge-paid' : 'admin-badge-pending'}`}>
                      {item.media_type}
                    </span>
                    <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                      {item.storage_path ? 'Uploaded' : isHotlinkedDrive(item.url) ? 'Drive' : 'External'}
                    </span>
                  </div>

                  <input
                    className="admin-caption-input"
                    defaultValue={item.caption || ''}
                    placeholder="Add a caption…"
                    onBlur={(e) => saveCaption(item, e.target.value)}
                    aria-label={`Caption for item ${index + 1}`}
                  />

                  <div className="admin-media-card-actions">
                    <button className="admin-cat-action-btn" onClick={() => move(index, -1)} disabled={index === 0} title="Move earlier" aria-label="Move earlier">
                      <ArrowUp size={14} />
                    </button>
                    <button className="admin-cat-action-btn" onClick={() => move(index, 1)} disabled={index === media.length - 1} title="Move later" aria-label="Move later">
                      <ArrowDown size={14} />
                    </button>
                    <button className="admin-media-delete" onClick={() => removeMedia(item)} style={{ marginLeft: 'auto' }}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showEventForm && (
          <EventFormModal
            form={eventForm}
            error={eventError}
            isSaving={isSavingEvent}
            isEditing={!!editingEventId}
            yearHasSibling={yearHasSibling}
            onInput={handleEventInput}
            onCoverChange={setCoverImage}
            onSubmit={saveEvent}
            onClose={closeEventForm}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Past Events</h3>
        <button className="btn btn-primary admin-action-btn" onClick={startAddEvent} style={{ gap: '6px' }}>
          <Plus size={18} /> <span className="admin-action-label">Add Edition</span>
        </button>
      </div>

      {events.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <p>No past editions yet. Add one to start building the gallery.</p>
        </div>
      ) : (
        <div className="admin-cat-grid">
          {events.map(ev => (
            <div key={ev.id} className="admin-cat-card glass">
              <div className="admin-cat-card-header">
                <div style={{ minWidth: 0 }}>
                  <h4 className="admin-cat-name">
                    {ev.year}
                    {ev.edition_label && <span className="admin-edition-label">{ev.edition_label}</span>}
                  </h4>
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>{ev.title}</span>
                </div>
                <span className={`admin-badge ${ev.is_published ? 'admin-badge-paid' : 'admin-badge-pending'}`}>
                  {ev.is_published ? <Eye size={11} /> : <EyeOff size={11} />} {ev.is_published ? 'Live' : 'Hidden'}
                </span>
              </div>

              <div className="admin-cat-card-body">
                <div className="admin-cat-meta" style={{ flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                  {ev.event_date && <span><CalendarDays size={12} /> {formatDisplayDate(ev.event_date)}</span>}
                  {ev.participants && <span>{ev.participants} finishers</span>}
                </div>
                {ev.location && <p className="admin-media-caption-text" style={{ marginBottom: 4 }}>{ev.location}</p>}
              </div>

              <div className="admin-cat-card-actions" style={{ flexWrap: 'wrap' }}>
                <button className="btn btn-primary admin-action-btn" onClick={() => setSelected(ev)} style={{ gap: '6px', fontSize: '0.75rem', padding: '6px 12px' }}>
                  <ImageIcon size={14} /> Manage Photos
                </button>
                <button className="admin-cat-action-btn" onClick={() => startEditEvent(ev)}>
                  <Edit3 size={14} /> Edit
                </button>
                <button className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => removeEvent(ev)} aria-label={`Delete ${ev.year} edition`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEventForm && (
        <EventFormModal
          form={eventForm}
          error={eventError}
          isSaving={isSavingEvent}
          isEditing={!!editingEventId}
          yearHasSibling={yearHasSibling}
          onInput={handleEventInput}
          onCoverChange={setCoverImage}
          onSubmit={saveEvent}
          onClose={closeEventForm}
        />
      )}
    </div>
  );
}

function EventFormModal({ form, error, isSaving, isEditing, yearHasSibling, onInput, onCoverChange, onSubmit, onClose }) {
  const firstFieldRef = useRef(null);

  // Mount only. This deliberately does NOT depend on onClose: when it did, every
  // keystroke re-created the parent's handler, re-ran the effect, and yanked
  // focus back to the Year field mid-typing.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstFieldRef.current?.focus();
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // Separate effect, so re-binding the key handler can never disturb focus.
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
        aria-labelledby="pe-modal-title"
      >
        <div className="admin-modal-header">
          <div>
            <h3 id="pe-modal-title">{isEditing ? 'Edit Edition' : 'Add Edition'}</h3>
            <p className="admin-modal-subtitle">
              {isEditing
                ? 'Update how this edition appears on the Past Events page.'
                : 'Create a past edition, then add its photos.'}
            </p>
          </div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <form onSubmit={onSubmit} className="admin-modal-form">
          <div className="admin-modal-body">
            <section className="admin-form-section">
              <h4 className="admin-form-section-title">Edition</h4>
              <div className="admin-media-form-grid">
                <div className="admin-media-form-group">
                  <label htmlFor="pe-year">Year <span className="admin-required">*</span></label>
                  <input
                    ref={firstFieldRef}
                    id="pe-year"
                    name="year"
                    value={form.year}
                    onChange={onInput}
                    placeholder="2025"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                  />
                </div>
                <div className="admin-media-form-group">
                  <label htmlFor="pe-title">Title <span className="admin-required">*</span></label>
                  <input id="pe-title" name="title" value={form.title} onChange={onInput} placeholder="Goda Epic Trail — 2nd Edition" />
                </div>
              </div>

              <div className="admin-media-form-group">
                <label htmlFor="pe-label">Short Label</label>
                <input id="pe-label" name="edition_label" value={form.edition_label} onChange={onInput} placeholder="Spring" maxLength={24} />
                <span className="admin-field-hint">
                  {yearHasSibling
                    ? `${form.year} already has another edition — add a short label so visitors can tell them apart on the year buttons.`
                    : 'Optional. Only needed when two editions share a year.'}
                </span>
              </div>
            </section>

            <section className="admin-form-section">
              <h4 className="admin-form-section-title">Details</h4>
              <div className="admin-media-form-grid">
                <div className="admin-media-form-group">
                  <label htmlFor="pe-date">Date</label>
                  <input id="pe-date" name="event_date" type="date" value={form.event_date} onChange={onInput} />
                  <span className="admin-field-hint">
                    {form.event_date
                      ? `Shows as “${formatDisplayDate(form.event_date)}”.`
                      : 'The day this edition was held.'}
                  </span>
                </div>
                <div className="admin-media-form-group">
                  <label htmlFor="pe-participants">Finishers</label>
                  <input id="pe-participants" name="participants" value={form.participants} onChange={onInput} placeholder="1000+" />
                  <span className="admin-field-hint">Free text, so &ldquo;1000+&rdquo; works.</span>
                </div>
              </div>

              <div className="admin-media-form-group">
                <label htmlFor="pe-location">Location</label>
                <input id="pe-location" name="location" value={form.location} onChange={onInput} placeholder="Gangapur Backwaters, Girnare" />
              </div>

              <div className="admin-media-form-group">
                <label htmlFor="pe-description">Description</label>
                <textarea
                  id="pe-description"
                  name="description"
                  value={form.description}
                  onChange={onInput}
                  rows={3}
                  style={{ resize: 'vertical' }}
                  placeholder="A short paragraph about this edition, shown under the stats."
                />
              </div>
            </section>

            <section className="admin-form-section">
              <h4 className="admin-form-section-title">Cover Image</h4>
              <ImageUploadField
                id="pe-cover-upload"
                value={form.cover_image}
                onChange={onCoverChange}
                folder={`${form.year || 'covers'}/covers`}
                label="Page hero for this edition"
                hint="Used as the banner when this year is selected. Landscape images work best."
              />
            </section>

            <section className="admin-form-section">
              <h4 className="admin-form-section-title">Visibility</h4>
              <div className="admin-toggle-row">
                <label className="admin-toggle-label">
                  <input type="checkbox" name="is_published" checked={form.is_published} onChange={onInput} className="admin-toggle-checkbox" />
                  <span className="admin-toggle-switch"></span>
                  <span>{form.is_published ? 'Visible on the site' : 'Hidden from the site'}</span>
                </label>
                <div className="admin-media-form-group admin-order-field">
                  <label htmlFor="pe-order">Order</label>
                  <input id="pe-order" name="display_order" type="number" value={form.display_order} onChange={onInput} />
                  <span className="admin-field-hint">Lower numbers appear first.</span>
                </div>
              </div>
            </section>

            {error && <div className="admin-login-error"><span>{error}</span></div>}
          </div>

          <div className="admin-modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Edition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
