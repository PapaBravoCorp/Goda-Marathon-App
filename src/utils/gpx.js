/**
 * Course files: read a GPX, trim it to what a course map needs, write it back
 * out, and measure it.
 *
 * Plain functions with no map library, shared by Admin → Categories (which
 * checks and trims a file before uploading it) and the event page (which reads
 * the trimmed copy back). A line is { name, points: [{ lat, lon, ele }] } and a
 * waypoint { lat, lon, ele, name }, with `ele` null where the file has none.
 */

// Mean Earth radius. Its error against the ellipsoid is far below GPS noise.
const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;

// A waypoint further than this from the course is not on it. In a file that
// carries several distances it belongs to one of the others.
const WAYPOINT_REACH_M = 150;
// A course whose two ends are closer than this starts and finishes in one place.
const LOOP_GAP_M = 150;
// Shorter than this is a watch left recording at the start line, not a course.
const MIN_COURSE_M = 100;
// Rises and dips smaller than this are GPS and barometer noise, not climbing.
const CLIMB_STEP_M = 3;
// The trimmed copy keeps every bend that moves the line more than this many
// metres sideways, or the profile more than this many metres up or down:
// invisible on the map and the profile, and well inside what a watch navigates
// by. The tolerances grow until the copy is at most MAX_POINTS long, so a
// one-second recording of a long course stays light for a phone to download.
const TRIM_SIDEWAYS_M = 4;
const TRIM_VERTICAL_M = 3;
const MAX_POINTS = 4000;

const kmFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const metreFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 15312 → "15.3 km" */
export const formatKm = (metres) => `${kmFormat.format(metres / 1000)} km`;
/** 842.4 → "842 m" */
export const formatMetres = (metres) => `${metreFormat.format(metres)} m`;

/** Great-circle distance in metres between two { lat, lon }. */
export function haversine(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Metres from the start of the line at each of its points. */
function alongDistances(points) {
  const along = new Array(points.length);
  along[0] = 0;
  for (let i = 1; i < points.length; i++) along[i] = along[i - 1] + haversine(points[i - 1], points[i]);
  return along;
}

/** Length of a line in metres. */
export const lineLength = (points) => alongDistances(points)[points.length - 1];

// ── Reading ────────────────────────────────────────────────────────────────
// GPX 1.0 and 1.1 use different namespaces and some exporters use none, so
// elements are matched on their local name alone.

const childrenNamed = (el, name) => Array.from(el.children).filter(c => c.localName === name);

const childText = (el, name) => (childrenNamed(el, name)[0]?.textContent || '').trim().slice(0, 80);

function readPoint(el) {
  const lat = parseFloat(el.getAttribute('lat'));
  const lon = parseFloat(el.getAttribute('lon'));
  // NaN fails both comparisons. 0,0 is a receiver without a fix, not a place
  // on any course here.
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || (lat === 0 && lon === 0)) return null;
  const ele = parseFloat(childText(el, 'ele'));
  return { lat, lon, ele: Number.isFinite(ele) ? ele : null };
}

const readPoints = (parent, name) => childrenNamed(parent, name).map(readPoint).filter(Boolean);

/**
 * Every track and route in a GPX file, and its waypoints. Throws an Error
 * whose message can be shown to an organiser as it stands.
 */
export function parseGpx(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'gpx' || doc.getElementsByTagName('parsererror').length) {
    throw new Error('This is not a GPX file, or it is damaged. Export the course again as GPX.');
  }

  const lines = [];
  for (const trk of childrenNamed(root, 'trk')) {
    // Segments are breaks in one recording, so they join back into one line.
    const points = childrenNamed(trk, 'trkseg').flatMap(seg => readPoints(seg, 'trkpt'));
    if (points.length >= 2) lines.push({ name: childText(trk, 'name'), points });
  }
  for (const rte of childrenNamed(root, 'rte')) {
    const points = readPoints(rte, 'rtept');
    if (points.length >= 2) lines.push({ name: childText(rte, 'name'), points });
  }

  const waypoints = childrenNamed(root, 'wpt')
    .map(el => {
      const point = readPoint(el);
      return point && { ...point, name: childText(el, 'name') || childText(el, 'desc') };
    })
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error(waypoints.length
      ? 'This GPX file holds only waypoints. It needs the course itself, as a track or a route.'
      : 'This GPX file has no track or route in it.');
  }
  // A line that goes nowhere cannot be drawn or measured, so it is not offered.
  const courses = lines.filter(l => lineLength(l.points) >= MIN_COURSE_M);
  if (courses.length === 0) {
    throw new Error(`The course in this file is under ${MIN_COURSE_M} m long. It may be a recording that never left the start; export the planned course instead.`);
  }

  // GPX 1.1 names the file in <metadata>; 1.0 directly under <gpx>.
  const metadata = childrenNamed(root, 'metadata')[0];
  return { name: childText(metadata || root, 'name'), lines: courses, waypoints };
}

/**
 * Elevation at every point, or at none. A few gaps are filled from the points
 * either side; a file missing it at more than one point in ten is treated as
 * having none, rather than drawing a profile out of guesses.
 */
function fillElevation(points) {
  const known = points.reduce((n, p) => n + (p.ele != null ? 1 : 0), 0);
  if (known < points.length * 0.9) return points.map(p => ({ ...p, ele: null }));
  if (known === points.length) return points;

  const filled = points.map(p => ({ ...p }));
  let prev = -1;
  filled.forEach((p, i) => {
    if (p.ele == null) return;
    for (let j = prev + 1; j < i; j++) {
      filled[j].ele = prev === -1
        ? p.ele
        : filled[prev].ele + (p.ele - filled[prev].ele) * (j - prev) / (i - prev);
    }
    prev = i;
  });
  for (let j = prev + 1; j < filled.length; j++) filled[j].ele = filled[prev].ele;
  return filled;
}

/**
 * Where `target` sits relative to a line: metres off it (`offM`), metres from
 * the start to the closest spot on it (`alongM`), and the nearest point's index.
 * Measured on a flat projection centred on the target, which over the size of
 * a race course is accurate to centimetres.
 */
function locate(points, along, target) {
  const kx = Math.cos(target.lat * DEG) * EARTH_RADIUS_M * DEG;
  const ky = EARTH_RADIUS_M * DEG;
  let best = { offM: Infinity, alongM: 0, index: 0 };
  for (let i = 1; i < points.length; i++) {
    const ax = (points[i - 1].lon - target.lon) * kx;
    const ay = (points[i - 1].lat - target.lat) * ky;
    const dx = (points[i].lon - target.lon) * kx - ax;
    const dy = (points[i].lat - target.lat) * ky - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const offM = Math.hypot(ax + t * dx, ay + t * dy);
    if (offM < best.offM) {
      best = { offM, alongM: along[i - 1] + t * (along[i] - along[i - 1]), index: t < 0.5 ? i - 1 : i };
    }
  }
  return best;
}

// ── Measuring ──────────────────────────────────────────────────────────────

/**
 * What the map and the profile draw from: distance from the start at every
 * point, the total, climbing, the high and low points, whether the course is
 * a loop, and where along it each waypoint falls (sorted from the start).
 */
export function measureCourse({ name = '', points: rawPoints, waypoints: rawWaypoints = [] }) {
  const points = fillElevation(rawPoints);
  const along = alongDistances(points);
  const hasElevation = points[0].ele != null;

  let ascent = 0;
  let descent = 0;
  let highIndex = 0;
  let lowIndex = 0;
  if (hasElevation) {
    let ref = points[0].ele;
    points.forEach((p, i) => {
      if (p.ele >= ref + CLIMB_STEP_M) { ascent += p.ele - ref; ref = p.ele; }
      else if (p.ele <= ref - CLIMB_STEP_M) { descent += ref - p.ele; ref = p.ele; }
      if (p.ele > points[highIndex].ele) highIndex = i;
      if (p.ele < points[lowIndex].ele) lowIndex = i;
    });
  }

  const waypoints = rawWaypoints
    .map(w => {
      const { alongM } = locate(points, along, w);
      return { ...w, alongM };
    })
    .sort((a, b) => a.alongM - b.alongM);

  return {
    name,
    points,
    along,
    distanceM: along[along.length - 1],
    hasElevation,
    ascent,
    descent,
    highIndex,
    lowIndex,
    waypoints,
    isLoop: haversine(points[0], points[points.length - 1]) <= LOOP_GAP_M,
  };
}

/** A course file as the map draws it: its longest line, measured. */
export function readCourse(text) {
  const { name, lines, waypoints } = parseGpx(text);
  const lengths = lines.map(l => lineLength(l.points));
  const longest = lines[lengths.indexOf(Math.max(...lengths))];
  return measureCourse({ name: name || longest.name, points: longest.points, waypoints });
}

/** The position (and elevation) `alongM` metres from the start, between points. */
export function pointAt(course, alongM) {
  const { points, along } = course;
  if (alongM <= 0) return points[0];
  if (alongM >= course.distanceM) return points[points.length - 1];
  let lo = 0;
  let hi = along.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (along[mid] <= alongM) lo = mid; else hi = mid;
  }
  const span = along[hi] - along[lo];
  const t = span > 0 ? (alongM - along[lo]) / span : 0;
  const a = points[lo];
  const b = points[hi];
  return {
    lat: a.lat + t * (b.lat - a.lat),
    lon: a.lon + t * (b.lon - a.lon),
    ele: a.ele == null ? null : a.ele + t * (b.ele - a.ele),
  };
}

/** Index of the point closest to `alongM` metres from the start. */
export function indexAt(course, alongM) {
  const { along } = course;
  let lo = 0;
  let hi = along.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (along[mid] <= alongM) lo = mid; else hi = mid;
  }
  return alongM - along[lo] <= along[hi] - alongM ? lo : hi;
}

/** Index of the course point nearest a spot on the map. */
export const nearestIndex = (course, lat, lon) => locate(course.points, course.along, { lat, lon }).index;

// ── Trimming and writing ───────────────────────────────────────────────────

/**
 * Douglas–Peucker, keeping a point when dropping it would move the line more
 * than `sideways` metres on the ground or the profile more than `vertical`
 * metres. Iterative, so a long recording cannot overflow the stack.
 */
function simplify(points, sideways, vertical) {
  const n = points.length;
  if (n <= 2) return points;

  const kx = Math.cos(points[0].lat * DEG) * EARTH_RADIUS_M * DEG;
  const ky = EARTH_RADIUS_M * DEG;
  const x = points.map(p => (p.lon - points[0].lon) * kx);
  const y = points.map(p => (p.lat - points[0].lat) * ky);
  const along = alongDistances(points);
  const hasEle = points[0].ele != null;

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const dx = x[b] - x[a];
    const dy = y[b] - y[a];
    const len2 = dx * dx + dy * dy;
    const span = along[b] - along[a];
    let worst = 1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x[i] - x[a]) * dx + (y[i] - y[a]) * dy) / len2)) : 0;
      let score = Math.hypot(x[i] - x[a] - t * dx, y[i] - y[a] - t * dy) / sideways;
      if (hasEle) {
        const f = span > 0 ? (along[i] - along[a]) / span : 0;
        const expected = points[a].ele + f * (points[b].ele - points[a].ele);
        score = Math.max(score, Math.abs(points[i].ele - expected) / vertical);
      }
      if (score > worst) { worst = score; at = i; }
    }
    if (at !== -1) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const escapeXml = (s) => String(s).replace(/[<>&'"]/g, c => (
  { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
));
const pointAttrs = (p) => `lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"`;
const eleTag = (p) => (p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : '');

/** GPX 1.1 with one track and its waypoints: what is uploaded and downloaded. */
export function toGpx({ name, points, waypoints = [] }) {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="GODA Epic Trail Run" xmlns="http://www.topografix.com/GPX/1/1">',
  ];
  if (name) out.push(`<metadata><name>${escapeXml(name)}</name></metadata>`);
  for (const w of waypoints) {
    out.push(`<wpt ${pointAttrs(w)}>${eleTag(w)}${w.name ? `<name>${escapeXml(w.name)}</name>` : ''}</wpt>`);
  }
  out.push('<trk>');
  if (name) out.push(`<name>${escapeXml(name)}</name>`);
  out.push('<trkseg>');
  for (const p of points) out.push(`<trkpt ${pointAttrs(p)}>${eleTag(p)}</trkpt>`);
  out.push('</trkseg>', '</trk>', '</gpx>', '');
  return out.join('\n');
}

/**
 * The copy of one line of a parsed file that gets uploaded: trimmed, carrying
 * the waypoints that lie on it, as GPX text, and measured exactly as the event
 * page will measure it, so the admin preview is what visitors will see.
 */
export function prepareCourse(parsed, lineIndex, name) {
  const line = parsed.lines[lineIndex];
  const points = fillElevation(line.points);

  let sideways = TRIM_SIDEWAYS_M;
  let vertical = TRIM_VERTICAL_M;
  let trimmed = simplify(points, sideways, vertical);
  while (trimmed.length > MAX_POINTS) {
    sideways *= 1.5;
    vertical *= 1.5;
    trimmed = simplify(points, sideways, vertical);
  }

  const along = alongDistances(points);
  const waypoints = parsed.waypoints.filter(w => locate(points, along, w).offM <= WAYPOINT_REACH_M);

  const gpx = toGpx({ name: name || line.name || parsed.name, points: trimmed, waypoints });
  return { gpx, course: readCourse(gpx) };
}
