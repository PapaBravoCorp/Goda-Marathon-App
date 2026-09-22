import React, { useState, useRef } from 'react';
import { Upload, X, Link2, AlertTriangle, RefreshCw } from 'lucide-react';
import { uploadMedia, validateFile, storagePathFromPublicUrl, deleteStoredMedia } from '../../utils/services/storage';
import { normalizeMediaUrl, resolveImageUrl } from '../../utils/mediaUrl';

/**
 * Single-image picker: upload a file, or paste a URL.
 *
 * Replacing an uploaded image deletes the file it replaces, so swapping a
 * cover a few times does not leave orphans behind in the bucket.
 */
export default function ImageUploadField({
  value,
  onChange,
  folder = 'misc',
  label = 'Image',
  hint,
  id = 'image-upload',
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const inputRef = useRef(null);

  const commit = async (nextUrl) => {
    // Clean up the previous file only when we own it.
    const previousPath = storagePathFromPublicUrl(value);
    if (previousPath && nextUrl !== value) {
      await deleteStoredMedia(previousPath);
    }
    setPreviewFailed(false);
    onChange(nextUrl);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError('');

    const problem = validateFile(file);
    if (problem) { setError(problem); return; }
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file (JPG, PNG, WEBP or GIF).');
      return;
    }

    setIsUploading(true);
    try {
      const { publicUrl } = await uploadMedia(file, folder);
      await commit(publicUrl);
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const applyUrl = () => {
    setError('');
    const result = normalizeMediaUrl(urlDraft, 'image');
    if (!result.ok) { setError(result.error); return; }
    commit(result.url);
    setUrlDraft('');
    setShowUrlInput(false);
  };

  const clear = async () => {
    const path = storagePathFromPublicUrl(value);
    if (path) await deleteStoredMedia(path);
    setPreviewFailed(false);
    onChange('');
  };

  return (
    <div className="admin-image-field">
      <span className="admin-image-field-label">{label}</span>

      {value ? (
        <div className="admin-image-preview">
          {previewFailed ? (
            <div className="admin-image-preview-broken">
              <AlertTriangle size={20} />
              <span>Could not load this image</span>
            </div>
          ) : (
            <img
              src={resolveImageUrl(value, 600)}
              alt=""
              onError={() => setPreviewFailed(true)}
            />
          )}

          <div className="admin-image-preview-bar">
            <span className="admin-image-preview-name" title={value}>
              {storagePathFromPublicUrl(value)?.split('/').pop() || value}
            </span>
            <div className="admin-image-preview-actions">
              <button
                type="button"
                className="admin-cat-action-btn"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
              >
                <RefreshCw size={13} className={isUploading ? 'spin' : ''} />
                {isUploading ? 'Uploading…' : 'Replace'}
              </button>
              <button
                type="button"
                className="admin-cat-action-btn admin-cat-delete-btn"
                onClick={clear}
                disabled={isUploading}
                aria-label="Remove image"
              >
                <X size={13} /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`admin-dropzone admin-dropzone--compact ${isDragging ? 'is-dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Upload ${label.toLowerCase()}`}
          >
            {isUploading ? (
              <>
                <RefreshCw size={20} className="spin" />
                <p className="admin-dropzone-title">Uploading…</p>
              </>
            ) : (
              <>
                <Upload size={20} />
                <p className="admin-dropzone-title">Drop an image, or click to browse</p>
                <p className="admin-dropzone-hint">JPG, PNG, WEBP or GIF · up to 10 MB</p>
              </>
            )}
          </div>

          {showUrlInput ? (
            <div className="admin-image-url-row">
              <input
                value={urlDraft}
                onChange={(e) => { setUrlDraft(e.target.value); setError(''); }}
                placeholder="https://… or /images/trail_hero.png"
                aria-label={`${label} URL`}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyUrl(); } }}
              />
              <button type="button" className="btn btn-primary admin-action-btn" onClick={applyUrl}>Use</button>
              <button
                type="button"
                className="admin-cat-action-btn"
                onClick={() => { setShowUrlInput(false); setUrlDraft(''); setError(''); }}
                aria-label="Cancel URL entry"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button type="button" className="admin-image-url-toggle" onClick={() => setShowUrlInput(true)}>
              <Link2 size={13} /> or use a URL instead
            </button>
          )}
        </>
      )}

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
      />

      {hint && !error && <span className="admin-field-hint">{hint}</span>}
      {error && (
        <div className="admin-login-error" style={{ marginTop: '0.5rem' }}>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
