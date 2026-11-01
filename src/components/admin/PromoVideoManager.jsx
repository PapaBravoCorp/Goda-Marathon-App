import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Edit3, ArrowUp, ArrowDown, Eye, EyeOff, AlertTriangle, ExternalLink, Film,
} from 'lucide-react';
import ContentModal from './ContentModal';
import {
  getAllPromoVideos, addPromoVideo, updatePromoVideo, deletePromoVideo, reorderPromoVideos,
} from '../../utils/services/promoVideos';
import { describeSaveError } from '../../utils/services/errors';
import { getYouTubeId, isYouTubeShortUrl, youTubeThumbnail } from '../../utils/mediaUrl';

const ORIENTATIONS = [
  { value: 'landscape', label: 'Wide (16:9)' },
  { value: 'portrait', label: 'Vertical (9:16): a Short or reel' },
];

// YouTube's stand-in image for a video it will not show is 120 px wide.
const PLACEHOLDER_WIDTH = 120;

const emptyForm = { url: '', title: '', caption: '', orientation: 'landscape', is_published: true };

function watchUrl(video) {
  return video.orientation === 'portrait'
    ? `https://www.youtube.com/shorts/${video.youtube_id}`
    : `https://youtu.be/${video.youtube_id}`;
}

function describeLoadError(error) {
  const message = error?.message || '';
  if (/promo_videos/i.test(message) && /does not exist|schema cache/i.test(message)) {
    return 'The promo videos table does not exist yet. Run supabase/migrations/0021_promo_videos.sql in the Supabase SQL editor, then reload this page.';
  }
  return message ? `Could not load promo videos: ${message}` : 'Could not load promo videos.';
}

/**
 * Admin -> Website -> Promo videos: YouTube videos in the "Watch the Trail"
 * band below the homepage hero. The first visible one is shown large.
 *
 * Only a YouTube link is accepted. The promos are high resolution, and
 * YouTube streams them at the quality each visitor can take, at no cost to
 * the site; storage here caps files at 10 MB. Each video saves from its own
 * form, and a hidden one is not readable by the public at all (0021).
 */
export default function PromoVideoManager() {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const addButtonRef = useRef(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await getAllPromoVideos());
      setLoadError('');
    } catch (err) {
      setLoadError(describeLoadError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onInput = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value };
      // A Shorts link is certainly vertical. Any other link could be either,
      // so the choice is left alone.
      if (name === 'url' && isYouTubeShortUrl(value)) next.orientation = 'portrait';
      return next;
    });
    setError('');
  };

  const startAdd = () => {
    setForm(emptyForm); setEditing(null); setError(''); setShowForm(true);
  };

  const startEdit = (item) => {
    setForm({
      url: watchUrl(item),
      title: item.title || '',
      caption: item.caption || '',
      orientation: item.orientation === 'portrait' ? 'portrait' : 'landscape',
      is_published: item.is_published !== false,
    });
    setEditing(item); setError(''); setShowForm(true);
  };

  const closeForm = useCallback(() => {
    setShowForm(false); setEditing(null);
  }, []);

  const youtubeId = getYouTubeId(form.url.trim());

  const save = async (e) => {
    e.preventDefault();
    if (!form.url.trim()) { setError('Paste the video’s YouTube link.'); return; }
    if (!youtubeId) {
      setError('That is not a YouTube video link. Open the video on YouTube, press Share, copy the link and paste it here.');
      return;
    }
    if (!form.title.trim()) { setError('Give the video a title.'); return; }
    const duplicate = items.find(i => i.youtube_id === youtubeId && i.id !== editing?.id);
    if (duplicate) { setError(`That video is already in the list as “${duplicate.title}”.`); return; }

    setIsSaving(true);
    try {
      const payload = {
        youtube_id: youtubeId,
        title: form.title.trim(),
        caption: form.caption.trim() || null,
        orientation: form.orientation,
        is_published: form.is_published,
      };
      if (editing) await updatePromoVideo(editing.id, payload);
      else await addPromoVideo({ ...payload, display_order: items.length });

      closeForm();
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(describeSaveError(err, 'promo video'));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove “${item.title}” from the homepage? The video stays on YouTube.`)) return;
    try {
      await deletePromoVideo(item.id);
      await load();
      // The pressed button is gone with its row; without this, focus falls
      // back to the top of the page.
      addButtonRef.current?.focus();
    } catch (err) { window.alert(describeSaveError(err, 'promo video')); }
  };

  const togglePublished = async (item) => {
    try {
      await updatePromoVideo(item.id, { is_published: !item.is_published });
      await load();
    } catch (err) { window.alert(describeSaveError(err, 'promo video')); }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const moved = items[index];
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    // Keep focus on the video that moved, so it can be pressed again. At the
    // top or bottom its arrow is disabled, so the other arrow takes it.
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-video-id="${moved.id}"]`);
      const same = row?.querySelector(`[data-action="${direction < 0 ? 'up' : 'down'}"]`);
      const other = row?.querySelector(`[data-action="${direction < 0 ? 'down' : 'up'}"]`);
      (same && !same.disabled ? same : other)?.focus();
    });
    await reorderPromoVideos(next.map(i => i.id));
  };

  if (isLoading) return <div className="admin-empty-state">Loading promo videos…</div>;

  if (loadError) {
    return (
      <div className="admin-drive-warning">
        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>{loadError}</span>
      </div>
    );
  }

  const hiddenCount = items.filter(i => !i.is_published).length;
  const featuredId = items.find(i => i.is_published)?.id;

  return (
    <div>
      <div className="admin-reg-actions" style={{ justifyContent: 'space-between' }}>
        <span className="text-muted" style={{ fontSize: '0.85rem', alignSelf: 'center' }}>
          {items.length} video{items.length === 1 ? '' : 's'}
          {hiddenCount > 0 && ` · ${hiddenCount} hidden`}
        </span>
        <button ref={addButtonRef} type="button" className="btn btn-primary admin-action-btn" onClick={startAdd} style={{ gap: '6px' }}>
          <Plus size={18} aria-hidden="true" /> <span className="admin-action-label">Add Video</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '2rem 1rem' }}>
          <p>No videos yet. The Watch the Trail band stays hidden on the homepage until you add one.</p>
        </div>
      ) : (
        <div className="admin-content-list">
          {items.map((item, index) => (
            <div key={item.id} data-video-id={item.id} className={`admin-content-row admin-sponsor-row glass ${item.is_published ? '' : 'is-hidden'}`}>
              <span className="admin-video-thumb">
                <img src={youTubeThumbnail(item.youtube_id, 'mqdefault')} alt="" loading="lazy" />
              </span>
              <div className="admin-content-main">
                <div className="admin-content-title">
                  {item.title}
                  {item.id === featuredId && <span className="admin-content-flag admin-content-flag--featured">Shown large</span>}
                  {item.orientation === 'portrait' && <span className="admin-content-flag">Vertical</span>}
                  {!item.is_published && <span className="admin-content-flag">Hidden</span>}
                </div>
                <p className="admin-content-body">
                  {item.caption || 'No caption'}
                  {' · '}
                  <a className="admin-sponsor-link" href={watchUrl(item)} target="_blank" rel="noopener noreferrer">
                    Open on YouTube <ExternalLink size={12} aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </p>
              </div>
              {/* Each button names its video: a screen reader listing the
                  page's buttons would otherwise hear "Edit" five times. */}
              <div className="admin-content-actions">
                <button type="button" className="admin-cat-action-btn" data-action="up" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move “${item.title}” up`}><ArrowUp size={14} aria-hidden="true" /></button>
                <button type="button" className="admin-cat-action-btn" data-action="down" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move “${item.title}” down`}><ArrowDown size={14} aria-hidden="true" /></button>
                <button type="button" className="admin-cat-action-btn" onClick={() => togglePublished(item)} aria-label={item.is_published ? `Hide “${item.title}” from the site` : `Show “${item.title}” on the site`}>
                  {item.is_published ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                </button>
                <button type="button" className="admin-cat-action-btn" onClick={() => startEdit(item)} aria-label={`Edit “${item.title}”`}><Edit3 size={14} aria-hidden="true" /> Edit</button>
                <button type="button" className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => remove(item)} aria-label={`Delete “${item.title}”`}><Trash2 size={14} aria-hidden="true" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ContentModal
          title={editing ? `Edit “${editing.title}”` : 'Add Video'}
          error={error}
          isSaving={isSaving}
          onSubmit={save}
          onClose={closeForm}
        >
          <div className="admin-media-form-group">
            <label htmlFor="promo-url">YouTube link <span className="admin-required" aria-hidden="true">*</span></label>
            <input
              id="promo-url"
              name="url"
              value={form.url}
              onChange={onInput}
              placeholder="https://youtu.be/…   or   https://www.youtube.com/shorts/…"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-required="true"
              aria-invalid={(!!form.url.trim() && !youtubeId) || undefined}
              aria-describedby="promo-url-hint promo-url-status"
            />
            <span id="promo-url-hint" className="admin-field-hint">
              On YouTube, press Share under the video and copy the link. Public or Unlisted both
              work; a Private video cannot be shown on the site.
            </span>
          </div>

          {/* Stays mounted, so what the check finds is read out as it changes. */}
          <div id="promo-url-status" aria-live="polite">
            <LinkPreview key={youtubeId || 'none'} youtubeId={youtubeId} hasInput={!!form.url.trim()} />
          </div>

          <div className="admin-media-form-grid" style={{ marginTop: '1rem' }}>
            <div className="admin-media-form-group">
              <label htmlFor="promo-title">Title <span className="admin-required" aria-hidden="true">*</span></label>
              <input id="promo-title" name="title" value={form.title} onChange={onInput} placeholder="e.g. Official Promo 2026" maxLength={80} aria-required="true" aria-describedby="promo-title-hint" />
              <span id="promo-title-hint" className="admin-field-hint">Shown under the video.</span>
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="promo-orientation">Shape</label>
              <select id="promo-orientation" name="orientation" value={form.orientation} onChange={onInput} aria-describedby="promo-orientation-hint">
                {ORIENTATIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span id="promo-orientation-hint" className="admin-field-hint">Vertical for a phone-shaped video. A Shorts link sets it for you.</span>
            </div>
          </div>

          <div className="admin-media-form-group" style={{ marginTop: '0.85rem' }}>
            <label htmlFor="promo-caption">Caption</label>
            <input id="promo-caption" name="caption" value={form.caption} onChange={onInput} placeholder="e.g. Shot on the 21K route at sunrise" maxLength={120} aria-describedby="promo-caption-hint" />
            <span id="promo-caption-hint" className="admin-field-hint">One line under the title. Leave blank for none.</span>
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

/**
 * The video's thumbnail, straight from YouTube, so the admin can see the link
 * points at the right video. YouTube answers a wrong or private video with a
 * small grey stand-in, which is caught and explained.
 */
function LinkPreview({ youtubeId, hasInput }) {
  const [state, setState] = useState('loading'); // loading | ok | missing

  if (!youtubeId) {
    return hasInput ? (
      <div className="admin-hero-field-warning">
        <AlertTriangle size={14} />
        <span>That does not look like a YouTube video link yet.</span>
      </div>
    ) : null;
  }

  return (
    <div className="admin-video-preview">
      <span className="admin-video-thumb admin-video-thumb--large">
        {state === 'missing' ? (
          <Film size={28} aria-hidden="true" />
        ) : (
          <img
            src={youTubeThumbnail(youtubeId, 'hqdefault')}
            alt="Thumbnail of the linked video"
            onLoad={(e) => setState(e.currentTarget.naturalWidth <= PLACEHOLDER_WIDTH ? 'missing' : 'ok')}
            onError={() => setState('missing')}
          />
        )}
      </span>
      {state === 'missing' ? (
        <div className="admin-hero-field-warning">
          <AlertTriangle size={14} />
          <span>
            YouTube has no video at this link that it will show publicly. Check the link, and that the
            video is set to Public or Unlisted.
          </span>
        </div>
      ) : (
        <span className="admin-field-hint">
          {state === 'ok' ? `Found video ${youtubeId}.` : 'Checking the link…'} The site plays it in
          YouTube&apos;s player, in full quality.
        </span>
      )}
    </div>
  );
}
