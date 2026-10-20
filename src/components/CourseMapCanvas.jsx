import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import L from 'leaflet';
import { formatKm, nearestIndex, pointAt } from '../utils/gpx';

/*
 * Tile servers. Both are free to use with attribution at the traffic a race
 * site sees (OpenStreetMap's tile usage policy, OpenTopoMap's terms). Their
 * hosts are listed under img-src in vercel.json's Content-Security-Policy: a
 * provider added here must be added there too, or production blocks its tiles.
 */
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const BASE_LAYERS = [
  {
    name: 'Map',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, className: 'course-tiles-street', attribution: OSM_CREDIT },
  },
  {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: {
      subdomains: 'abc',
      maxZoom: 17,
      className: 'course-tiles-terrain',
      attribution: `${OSM_CREDIT}, SRTM | Style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)`,
    },
  },
];

// lucide's maximize-2, inline because Leaflet controls are plain DOM.
const FIT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';

// Every marker is a zero-size anchor on its point; CSS centres what it holds.
const pin = (className, html) => L.divIcon({ className, html, iconSize: [0, 0] });

/**
 * The Leaflet map of one course: the line, kilometre markers, start and
 * finish, and the file's waypoints. `activeIndex` is the point picked on the
 * map or the elevation profile, shown on both.
 */
export default function CourseMapCanvas({ course, activeIndex, onActiveChange, label }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const cursorRef = useRef(null);
  const [hint, setHint] = useState({ kind: null, shown: false });
  const reportActive = useEffectEvent((index) => onActiveChange(index));

  useEffect(() => {
    const el = containerRef.current;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const map = L.map(el, {
      // Scrolling the page must not get caught in the map. One finger and an
      // unclicked scroll wheel move the page; two fingers pan and pinch, and a
      // click hands the wheel to the map until focus leaves it.
      dragging: !coarse,
      scrollWheelZoom: false,
      zoomSnap: 0.25,
      zoomAnimation: !still,
      fadeAnimation: !still,
      markerZoomAnimation: !still,
    });
    mapRef.current = map;
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');

    const layers = Object.fromEntries(BASE_LAYERS.map(l => [l.name, L.tileLayer(l.url, l.options)]));
    layers.Map.addTo(map);
    L.control.layers(layers, null, { position: 'topright' }).addTo(map);

    const latlngs = course.points.map(p => [p.lat, p.lon]);
    L.polyline(latlngs, { className: 'course-line-casing', weight: 8, interactive: false }).addTo(map);
    L.polyline(latlngs, { className: 'course-line', weight: 4, interactive: false }).addTo(map);
    // A wide invisible band over the line, so it is easy to hover or tap.
    L.polyline(latlngs, { className: 'course-line-hit', weight: 22, opacity: 0 })
      .on('mousemove click', (e) => reportActive(nearestIndex(course, e.latlng.lat, e.latlng.lng)))
      .on('mouseout', () => reportActive(null))
      .addTo(map);

    const stepKm = course.distanceM <= 12000 ? 1 : course.distanceM <= 30000 ? 2 : 5;
    for (let km = stepKm; km * 1000 < course.distanceM - 250; km += stepKm) {
      const p = pointAt(course, km * 1000);
      L.marker([p.lat, p.lon], { icon: pin('course-km', `<span>${km}</span>`), interactive: false, keyboard: false })
        .addTo(map);
    }

    for (const w of course.waypoints) {
      // Waypoint names come from the uploaded file: set as text, never as HTML.
      const tip = document.createElement('span');
      tip.textContent = [w.name, formatKm(w.alongM)].filter(Boolean).join(' · ');
      L.marker([w.lat, w.lon], { icon: pin('course-stop', '<span></span>'), keyboard: false, riseOnHover: true })
        .bindTooltip(tip, { direction: 'top', offset: [0, -10] })
        .addTo(map);
    }

    const start = course.points[0];
    const finish = course.points[course.points.length - 1];
    const flag = (p, text, kind) => L.marker([p.lat, p.lon], {
      icon: pin(`course-flag course-flag--${kind}`, `<span class="course-flag-dot"></span><span class="course-flag-label">${text}</span>`),
      interactive: false,
      keyboard: false,
      zIndexOffset: 1000,
    }).addTo(map);
    if (course.isLoop) {
      flag(start, 'Start · Finish', 'start');
    } else {
      flag(finish, 'Finish', 'finish');
      flag(start, 'Start', 'start');
    }

    const bounds = L.latLngBounds(latlngs);
    const fitAll = (animate) => map.fitBounds(bounds, { padding: [32, 32], animate: animate && !still });
    fitAll(false);
    const fittedZoom = map.getZoom();
    // Zoomed well out, the kilometre markers pile on top of each other.
    map.on('zoomend', () => el.classList.toggle('is-zoomed-out', map.getZoom() < fittedZoom - 0.75));

    const FitControl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const bar = L.DomUtil.create('div', 'leaflet-bar course-map-fit');
        const button = L.DomUtil.create('button', '', bar);
        button.type = 'button';
        button.title = 'Show the whole course';
        button.setAttribute('aria-label', 'Show the whole course');
        button.innerHTML = FIT_ICON;
        L.DomEvent.disableClickPropagation(bar);
        L.DomEvent.on(button, 'click', () => fitAll(true));
        return bar;
      },
    });
    new FitControl().addTo(map);

    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());

    // Say why the map did not move, the way an embedded Google map does.
    let hintTimer;
    const flash = (kind) => {
      setHint({ kind, shown: true });
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => setHint(h => ({ ...h, shown: false })), 1500);
    };
    const onWheel = () => { if (!map.scrollWheelZoom.enabled()) flash('wheel'); };
    const onTouchMove = (e) => { if (coarse && e.touches.length === 1) flash('touch'); };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });

    // Leaflet follows window resizes on its own, not a container that changes
    // size inside an unchanged window.
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);

    cursorRef.current = L.circleMarker([start.lat, start.lon], { radius: 7, className: 'course-cursor', interactive: false });

    return () => {
      clearTimeout(hintTimer);
      observer.disconnect();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onTouchMove);
      map.remove();
      mapRef.current = null;
      cursorRef.current = null;
    };
  }, [course]);

  useEffect(() => {
    const map = mapRef.current;
    const cursor = cursorRef.current;
    if (!map || !cursor) return;
    if (activeIndex == null) {
      cursor.remove();
      return;
    }
    const p = course.points[activeIndex];
    cursor.setLatLng([p.lat, p.lon]);
    if (!map.hasLayer(cursor)) cursor.addTo(map);
    // Scrubbing the profile past the edge of a zoomed-in map brings the map along.
    if (!map.getBounds().contains(cursor.getLatLng())) map.panTo(cursor.getLatLng());
  }, [activeIndex, course]);

  return (
    <div className="course-map-frame">
      <div ref={containerRef} className="course-map" role="region" aria-label={label} />
      <div className={`course-map-hint${hint.shown ? ' is-shown' : ''}`} aria-hidden="true">
        {hint.kind === 'touch' ? 'Use two fingers to move the map' : 'Click the map to zoom with the scroll wheel'}
      </div>
    </div>
  );
}
