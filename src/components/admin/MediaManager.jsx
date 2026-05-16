import React, { useState, useEffect } from 'react';
import { Video, Plus, X, Trash2, RefreshCw } from 'lucide-react';
import { getPastEventMedia, addPastEventMedia, deletePastEventMedia } from '../../utils/storage';

export default function MediaManager() {
  const [media, setMedia] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    eventYear: '2025',
    eventTitle: 'Goda Epic Trail - 2nd Edition',
    mediaType: 'image',
    url: '',
    caption: '',
    displayOrder: 0
  });

  useEffect(() => { loadMedia(); }, []);

  const loadMedia = async () => {
    setIsLoading(true);
    const data = await getPastEventMedia();
    setMedia(data);
    setIsLoading(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formData.url.trim()) { setFormError('Media URL is required.'); return; }
    if (!formData.eventYear.trim()) { setFormError('Event year is required.'); return; }

    setIsSubmitting(true);
    try {
      await addPastEventMedia(formData);
      setFormData(prev => ({ ...prev, url: '', caption: '', displayOrder: 0 }));
      setShowForm(false);
      await loadMedia();
    } catch (err) {
      setFormError('Failed to add media. Please check the URL and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this media item?')) return;
    try {
      await deletePastEventMedia(id);
      await loadMedia();
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleInput = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div>
      <div className="admin-media-header">
        <h3 style={{ margin: 0 }}>Past Events Media</h3>
        <button className="btn btn-primary admin-action-btn" onClick={() => setShowForm(!showForm)} style={{ gap: '6px' }}>
          {showForm ? <X size={18} /> : <Plus size={18} />}
          <span className="admin-action-label">{showForm ? 'Cancel' : 'Add Media'}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="admin-media-form glass">
          <div className="admin-media-form-grid">
            <div className="admin-media-form-group">
              <label htmlFor="media-year">Event Year</label>
              <input id="media-year" name="eventYear" value={formData.eventYear} onChange={handleInput} placeholder="e.g. 2025" />
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="media-title">Event Title</label>
              <input id="media-title" name="eventTitle" value={formData.eventTitle} onChange={handleInput} placeholder="e.g. Goda Epic Trail Run" />
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="media-type">Media Type</label>
              <select id="media-type" name="mediaType" value={formData.mediaType} onChange={handleInput}>
                <option value="image">Image</option>
                <option value="video">Video (YouTube / Direct)</option>
              </select>
            </div>
            <div className="admin-media-form-group">
              <label htmlFor="media-order">Display Order</label>
              <input id="media-order" name="displayOrder" type="number" value={formData.displayOrder} onChange={handleInput} />
            </div>
          </div>
          <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="media-url">Media URL *</label>
            <input id="media-url" name="url" value={formData.url} onChange={handleInput} placeholder="https://... (image or YouTube URL)" />
          </div>
          <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="media-caption">Caption</label>
            <input id="media-caption" name="caption" value={formData.caption} onChange={handleInput} placeholder="Optional description" />
          </div>
          {formError && (
            <div className="admin-login-error" style={{ marginTop: '0.75rem' }}><span>{formError}</span></div>
          )}
          <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Add Media'}
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="admin-empty-state">Loading media...</div>
      ) : media.length === 0 ? (
        <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
          <p>No media added yet. Click "Add Media" to get started.</p>
        </div>
      ) : (
        <div className="admin-media-grid">
          {media.map(item => (
            <div key={item.id} className="admin-media-card glass">
              <div className="admin-media-preview">
                {item.media_type === 'image' ? (
                  <img src={item.url} alt={item.caption || 'Media'} onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--color-text-muted);font-size:0.8rem;">Image failed to load</div>';
                  }} />
                ) : (
                  <div className="admin-media-video-badge"><Video size={24} /><span>Video</span></div>
                )}
              </div>
              <div className="admin-media-info">
                <div className="admin-media-meta">
                  <span className={`admin-badge ${item.media_type === 'image' ? 'admin-badge-paid' : 'admin-badge-pending'}`}>{item.media_type}</span>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>{item.event_year}</span>
                </div>
                {item.caption && <p className="admin-media-caption-text">{item.caption}</p>}
                <button className="admin-media-delete" onClick={() => handleDelete(item.id)} aria-label="Delete media">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
