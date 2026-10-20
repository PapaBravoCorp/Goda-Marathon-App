import React, { useRef, useState } from 'react';
import { Download, Navigation, Loader } from 'lucide-react';
// Leaflet's stylesheet first, so the course map's overrides load after it.
import 'leaflet/dist/leaflet.css';
import './CourseMaps.css';
import CourseMapCanvas from './CourseMapCanvas';
import ElevationProfile from './ElevationProfile';
import { formatKm } from '../utils/gpx';
import { useCourse } from '../utils/useCourse';
import { courseDownloadUrl } from '../utils/services/storage';

const slugify = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** "300m elevation gain · Flag-off 06:45 AM", from what the organisers entered. */
function describeCategory(cat) {
  return [
    cat.elevation && cat.elevation !== '0m' && `${cat.elevation} elevation gain`,
    cat.flag_off_time && `Flag-off ${cat.flag_off_time}`,
  ].filter(Boolean).join(' · ');
}

/**
 * One course: the map, its elevation profile, the waypoints along it, the GPX
 * to download for a watch and directions to the start. Also the preview in
 * Admin → Categories, where `downloadUrl` is absent until the file is saved.
 */
export function CourseRoute({ course, title, meta, downloadUrl, compact = false }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const start = course.points[0];
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${start.lat.toFixed(6)},${start.lon.toFixed(6)}`;

  return (
    <div className={`course-route${compact ? ' course-route--compact' : ''}`}>
      <div className="course-route-head">
        <div>
          <h4 className="course-route-title">{title}</h4>
          {meta && <p className="course-route-meta">{meta}</p>}
        </div>
        <div className="course-route-actions">
          {downloadUrl && (
            <a className="btn btn-outline course-action" href={downloadUrl} download>
              <Download size={16} aria-hidden="true" /> Download GPX
            </a>
          )}
          <a className="btn btn-outline course-action" href={directionsUrl} target="_blank" rel="noopener noreferrer">
            <Navigation size={16} aria-hidden="true" /> Directions to the start
          </a>
        </div>
      </div>

      <CourseMapCanvas
        course={course}
        activeIndex={activeIndex}
        onActiveChange={setActiveIndex}
        label={`Map of the ${title} course`}
      />

      {course.hasElevation && (
        <ElevationProfile
          course={course}
          activeIndex={activeIndex}
          onActiveChange={setActiveIndex}
          title={title}
        />
      )}

      {course.waypoints.length > 0 && (
        <div className="course-stops">
          <h5 className="course-stops-title">Along the course</h5>
          <ol className="course-stops-list">
            {course.waypoints.map((w, i) => (
              <li key={i}>
                <span className="course-stops-dot" aria-hidden="true" />
                {/* The space keeps "5.6 km" and the name apart for a screen reader. */}
                <span className="course-stops-km">{formatKm(w.alongM)}</span>{' '}
                <span>{w.name || 'Waypoint'}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/**
 * Course maps on the event page, one tab per category with a GPX file
 * (event_categories.route_gpx, uploaded in Admin → Categories). Loaded lazily
 * together with Leaflet, so only a visitor who opens the event page pays for it.
 */
export default function CourseMaps({ categories, eventName }) {
  const [activeId, setActiveId] = useState(categories[0]?.id);
  const tabRefs = useRef([]);
  const active = categories.find(c => c.id === activeId) || categories[0];
  const { course, error } = useCourse(active.route_gpx);
  const downloadUrl = courseDownloadUrl(
    active.route_gpx,
    `${slugify(eventName) || 'course'}-${slugify(active.distance || active.name)}.gpx`
  );
  const tabbed = categories.length > 1;

  const onTabKeyDown = (e, index) => {
    let next;
    if (e.key === 'ArrowRight') next = (index + 1) % categories.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + categories.length) % categories.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = categories.length - 1;
    else return;
    e.preventDefault();
    setActiveId(categories[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="course-maps">
      {tabbed && (
        <div className="course-tabs" role="tablist" aria-label="Course maps by distance">
          {categories.map((cat, i) => {
            const selected = cat.id === active.id;
            return (
              <button
                key={cat.id}
                ref={(el) => { tabRefs.current[i] = el; }}
                type="button"
                role="tab"
                id={`course-tab-${cat.id}`}
                aria-selected={selected}
                aria-controls="course-panel"
                tabIndex={selected ? 0 : -1}
                className="course-tab"
                title={cat.name}
                onClick={() => setActiveId(cat.id)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
              >
                {cat.distance || cat.name}
              </button>
            );
          })}
        </div>
      )}

      <div
        id="course-panel"
        role={tabbed ? 'tabpanel' : undefined}
        aria-labelledby={tabbed ? `course-tab-${active.id}` : undefined}
      >
        {course ? (
          <CourseRoute
            key={active.id}
            course={course}
            title={active.name}
            meta={describeCategory(active)}
            downloadUrl={downloadUrl}
          />
        ) : error ? (
          <div className="course-route course-route--message" role="status">
            <p>The map of the {active.name} course could not be loaded.</p>
            <a className="btn btn-outline course-action" href={downloadUrl} download>
              <Download size={16} aria-hidden="true" /> Download the GPX file
            </a>
          </div>
        ) : (
          <div className="course-route course-route--loading" role="status">
            <Loader size={28} className="spin" aria-hidden="true" />
            <span className="sr-only">Loading the {active.name} course map…</span>
          </div>
        )}
      </div>
    </div>
  );
}
