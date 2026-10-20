import React, { lazy, Suspense, useRef, useState } from 'react';
import { Upload, X, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { parseGpx, prepareCourse, lineLength, formatKm, formatMetres } from '../../utils/gpx';
import { useCourse } from '../../utils/useCourse';
import ErrorBoundary from '../ErrorBoundary';

// The preview is the event page's own component, Leaflet and all, loaded only
// once there is a course to show.
const CoursePreview = lazy(() => import('../CourseMaps').then(m => ({ default: m.CourseRoute })));

// The file is read in the browser; this only guards that memory.
const MAX_SOURCE_MB = 30;
// A course this far off the category's distance is probably the wrong file.
const DISTANCE_TOLERANCE = 0.2;

/** "15km" → 15, "300m" → 0.3, unreadable → 0. Same reading as Home.jsx's toKm. */
function categoryKm(text) {
  const value = String(text ?? '').toLowerCase();
  const n = parseFloat(value.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return /\d\s*m\b/.test(value) && !value.includes('km') ? n / 1000 : n;
}

function describeCourse(course) {
  const parts = [formatKm(course.distanceM)];
  parts.push(course.hasElevation
    ? `about ${formatMetres(Math.round(course.ascent / 10) * 10)} of climbing`
    : 'no elevation in the file');
  const stops = course.waypoints.length;
  if (stops) parts.push(`${stops} waypoint${stops === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** The line closest to the category's distance, or the longest when that is unknown. */
function pickLine(lines, km) {
  const lengths = lines.map(l => lineLength(l.points) / 1000);
  const score = (i) => (km > 0 ? -Math.abs(lengths[i] - km) : lengths[i]);
  return lengths.reduce((best, _, i) => (score(i) > score(best) ? i : best), 0);
}

/**
 * GPX for a category's course map (event_categories.route_gpx, 0019).
 *
 * A chosen file is read, checked and trimmed in the browser at once and
 * previewed as the event page will show it, but uploaded only when the
 * category is saved, like the photos elsewhere in the panel. `pending` is
 * { fileName, source, lineIndex, gpx, course } for a file waiting to go up;
 * `value` is the URL the row will hold otherwise.
 */
export default function CourseMapField({
  value, savedValue, pending, onPending, onChange, categoryName, categoryDistance, disabled,
}) {
  const inputRef = useRef(null);
  const [isReading, setIsReading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const saved = useCourse(pending ? null : value || null);

  const busy = disabled || isReading;
  const name = (categoryName || '').trim();
  const expectedKm = categoryKm(categoryDistance);
  const course = pending ? pending.course : saved.course;
  const isUnsaved = !!pending || (value || '') !== (savedValue || '');

  const handleFile = async (file) => {
    if (!file || busy) return;
    setError('');
    if (!/\.gpx$/i.test(file.name)) {
      setError(/\.km[lz]$/i.test(file.name)
        ? 'That is a KML file, as Google My Maps and Google Earth export. Open it at gpx.studio, export it as GPX and upload that.'
        : 'Choose a GPX file (.gpx). Strava, Garmin Connect, Komoot and gpx.studio all export one.');
      return;
    }
    if (file.size > MAX_SOURCE_MB * 1024 * 1024) {
      setError(`That file is over ${MAX_SOURCE_MB} MB. Export the course rather than a whole recording, or trim it at gpx.studio.`);
      return;
    }

    setIsReading(true);
    try {
      const source = parseGpx(await file.text());
      const lineIndex = pickLine(source.lines, expectedKm);
      onPending({ fileName: file.name, source, lineIndex, ...prepareCourse(source, lineIndex, name) });
    } catch (err) {
      setError(err.message || 'This file could not be read.');
    } finally {
      setIsReading(false);
    }
  };

  const chooseLine = (lineIndex) => {
    onPending({ ...pending, lineIndex, ...prepareCourse(pending.source, lineIndex, name) });
  };

  let title;
  let detail;
  if (isReading) {
    title = <><RefreshCw size={14} className="spin" /> Reading the course…</>;
  } else if (pending) {
    title = pending.fileName;
    detail = describeCourse(pending.course);
  } else if (value && saved.error) {
    title = 'Course file missing';
    detail = 'It could not be loaded. Upload the GPX again.';
  } else if (value) {
    title = 'Course map set';
    detail = saved.course ? describeCourse(saved.course) : 'Loading…';
  } else {
    title = 'No course map';
    detail = 'The event page shows no map for this distance.';
  }

  const warnings = [];
  if (course && expectedKm > 0
    && Math.abs(course.distanceM / 1000 - expectedKm) / expectedKm > DISTANCE_TOLERANCE) {
    warnings.push(`This course measures ${formatKm(course.distanceM)}, but the category says ${categoryDistance}. Check that it is the right file.`);
  }
  if (pending && !pending.course.hasElevation) {
    warnings.push('The file has no elevation, so the event page shows the map without a profile. A course exported from Strava, Komoot or gpx.studio includes it.');
  }

  return (
    <div className="admin-image-field">
      <span className="admin-image-field-label">Course map (GPX)</span>

      <div
        className={`admin-hero-field ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
      >
        <div className="admin-hero-field-status" aria-live="polite">
          <span className="admin-hero-field-title" title={typeof title === 'string' ? title : undefined}>{title}</span>
          {detail && <span className="admin-hero-field-detail">{detail}</span>}
          {isUnsaved && !isReading && <span className="admin-hero-field-badge">Not saved yet</span>}
        </div>

        <div className="admin-image-preview-actions admin-hero-field-actions">
          <button type="button" className="admin-cat-action-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload size={13} /> {pending || value ? 'Replace GPX' : 'Upload GPX'}
          </button>
          {pending ? (
            <button type="button" className="admin-cat-action-btn" onClick={() => { onPending(null); setError(''); }} disabled={busy}>
              <X size={13} /> Discard
            </button>
          ) : value && (
            <button type="button" className="admin-cat-action-btn admin-cat-delete-btn" onClick={() => onChange('')} disabled={busy}>
              <Trash2 size={13} /> Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        className="sr-only"
        aria-label="Upload the course as a GPX file"
        onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
      />

      {pending && pending.source.lines.length > 1 && (
        <div className="admin-media-form-group" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="cat-course-line">This file holds {pending.source.lines.length} courses. Which one is this category?</label>
          <select
            id="cat-course-line"
            value={pending.lineIndex}
            onChange={(e) => chooseLine(Number(e.target.value))}
            disabled={busy}
          >
            {pending.source.lines.map((line, i) => (
              <option key={i} value={i}>
                {line.name || `Course ${i + 1}`} — {formatKm(lineLength(line.points))}
              </option>
            ))}
          </select>
        </div>
      )}

      {warnings.map(w => (
        <div key={w} className="admin-hero-field-warning"><AlertTriangle size={14} /> <span>{w}</span></div>
      ))}
      {error ? (
        <div className="admin-login-error" style={{ marginTop: '0.5rem' }}><span>{error}</span></div>
      ) : (
        <span className="admin-field-hint">
          The course as a GPX file: a Strava route (Export GPX), a Garmin Connect or Komoot course, or
          one drawn at gpx.studio. Aid stations added to the file as waypoints appear on the map with their
          distance. The file is trimmed in your browser, runners can download it for their watches, and it
          goes live when you save the category.
        </span>
      )}

      {course && (
        <div className="admin-course-preview">
          {/* Keyed by the course shown, so a new file starts a fresh preview
              (and clears a preview that failed). */}
          <ErrorBoundary
            key={pending ? `${pending.fileName}#${pending.lineIndex}` : value}
            fallback={<span className="admin-field-hint">The preview could not be shown.</span>}
          >
            <Suspense fallback={<div className="admin-course-preview-loading">Loading the preview…</div>}>
              <CoursePreview
                course={course}
                title={name || 'This category'}
                compact
              />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
}
