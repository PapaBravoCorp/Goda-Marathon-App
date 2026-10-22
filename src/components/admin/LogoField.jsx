import React, { useState, useEffect, useRef } from 'react';
import { Upload, Link2, X, RefreshCw, AlertTriangle, ImageOff } from 'lucide-react';
import { normalizeMediaUrl, resolveImageUrl } from '../../utils/mediaUrl';
import { prepareLogo, ACCEPTED_LOGO_TYPES } from '../../utils/prepareLogo';

const TILE_BACKGROUNDS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const DEFAULT_HINT = (
  <>
    PNG with a transparent background or SVG works best. Empty margins are trimmed and the
    logo is resized in your browser; it goes live when you click Save. Pick the tile that
    keeps the logo readable: Dark for white artwork.
  </>
);

/**
 * Logo picker, shared by Content -> Sponsors and the Website tab.
 *
 * A chosen file is processed straight away so the preview shows exactly what
 * will be served, but nothing is uploaded until the form is saved. An
 * abandoned edit therefore leaves nothing behind in the bucket.
 *
 * `pending` is { logo, fileName, previewUrl } for a logo waiting to upload.
 * `backgrounds` are the choices for what sits behind the logo; 'none' shows
 * it on `previewImage` (e.g. the hero photo) or a checkerboard.
 */
export default function LogoField({
  value, savedValue, pending, background, disabled,
  onProcessing, onPending, onChange, onBackground,
  label = 'Logo',
  required = false,
  backgrounds = TILE_BACKGROUNDS,
  backgroundLabel = 'Tile',
  prepareOptions,
  allowRemove = false,
  previewClassName = '',
  previewImage = null,
  hint = DEFAULT_HINT,
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [broken, setBroken] = useState(false);
  const inputRef = useRef(null);

  const busy = disabled || isProcessing;
  const shown = pending?.previewUrl || (value ? resolveImageUrl(value) : '');
  const isUnsaved = !!pending || (value || '') !== (savedValue || '');

  useEffect(() => { setBroken(false); }, [shown]);

  const handleFile = async (file) => {
    if (!file || busy) return;
    setError('');
    setIsProcessing(true);
    onProcessing?.(true);
    try {
      const logo = await prepareLogo(file, prepareOptions);
      onPending({ logo, fileName: file.name, previewUrl: URL.createObjectURL(logo.blob) });
      setShowUrlInput(false);
    } catch (err) {
      setError(err.message || 'This logo could not be processed.');
    } finally {
      setIsProcessing(false);
      onProcessing?.(false);
    }
  };

  const applyUrl = () => {
    setError('');
    const result = normalizeMediaUrl(urlDraft, 'image');
    if (!result.ok) { setError(result.error); return; }
    onPending(null);
    onChange(result.url);
    setUrlDraft('');
    setShowUrlInput(false);
  };

  const remove = () => {
    onPending(null);
    onChange('');
    setError('');
  };

  const photoBehind = background === 'none' && previewImage
    ? { backgroundImage: `linear-gradient(rgba(11, 22, 38, 0.45), rgba(11, 22, 38, 0.45)), url("${resolveImageUrl(previewImage)}")` }
    : undefined;

  return (
    <div className="admin-image-field">
      <span className="admin-image-field-label">
        {label} {required && <span className="admin-required">*</span>}
      </span>

      <div
        className={`admin-hero-field admin-logo-field ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
      >
        <span
          className={`admin-logo-preview is-${background} ${photoBehind ? 'has-photo' : ''} ${previewClassName}`}
          style={photoBehind}
        >
          {isProcessing ? (
            <RefreshCw size={18} className="spin" aria-label="Preparing logo" />
          ) : shown && !broken ? (
            <img src={shown} alt="Logo preview" onError={() => setBroken(true)} />
          ) : shown ? (
            <span className="admin-logo-preview-empty"><ImageOff size={18} /> Not loading</span>
          ) : (
            <span className="admin-logo-preview-empty">No logo yet</span>
          )}
        </span>

        <div className="admin-logo-field-side">
          <div className="admin-hero-field-status" aria-live="polite">
            {pending ? (
              <>
                <span className="admin-hero-field-title" title={pending.fileName}>{pending.fileName}</span>
                <span className="admin-hero-field-detail">
                  {pending.logo.width} × {pending.logo.height} {pending.logo.ext.toUpperCase()},{' '}
                  {Math.max(1, Math.round(pending.logo.blob.size / 1024))} KB
                </span>
              </>
            ) : value ? (
              <span className="admin-hero-field-detail" title={value}>{value}</span>
            ) : null}
            {isUnsaved && !isProcessing && <span className="admin-hero-field-badge">Not saved yet</span>}
          </div>

          <div className="admin-image-preview-actions admin-hero-field-actions">
            <button type="button" className="admin-cat-action-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Upload size={13} /> {pending || value ? 'Replace' : 'Upload logo'}
            </button>
            {pending ? (
              <button type="button" className="admin-cat-action-btn" onClick={() => { onPending(null); setError(''); }} disabled={busy}>
                <X size={13} /> Discard
              </button>
            ) : (
              <button type="button" className="admin-cat-action-btn" onClick={() => setShowUrlInput(v => !v)} disabled={busy}>
                <Link2 size={13} /> Use a URL
              </button>
            )}
            {allowRemove && !pending && value && (
              <button type="button" className="admin-cat-action-btn admin-cat-delete-btn" onClick={remove} disabled={busy}>
                <X size={13} /> Remove
              </button>
            )}
          </div>

          <div className="admin-chip-row" role="group" aria-label={`${backgroundLabel} behind the logo`}>
            <span className="admin-field-hint" style={{ margin: '0 4px 0 0', alignSelf: 'center' }}>{backgroundLabel}:</span>
            {backgrounds.map(bg => (
              <button
                key={bg.value}
                type="button"
                className={`admin-chip ${background === bg.value ? 'is-on' : ''}`}
                aria-pressed={background === bg.value}
                onClick={() => onBackground(bg.value)}
              >
                {bg.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showUrlInput && !pending && (
        <div className="admin-image-url-row" style={{ marginTop: '0.5rem' }}>
          <input
            value={urlDraft}
            onChange={(e) => { setUrlDraft(e.target.value); setError(''); }}
            placeholder="https://…/logo.png"
            aria-label="Logo URL"
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
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_LOGO_TYPES.join(',')}
        className="sr-only"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
      />

      {pending?.logo.warning && (
        <div className="admin-hero-field-warning"><AlertTriangle size={14} /> <span>{pending.logo.warning}</span></div>
      )}
      {error ? (
        <div className="admin-login-error" style={{ marginTop: '0.5rem' }}><span>{error}</span></div>
      ) : (
        <span className="admin-field-hint">{hint}</span>
      )}
    </div>
  );
}
