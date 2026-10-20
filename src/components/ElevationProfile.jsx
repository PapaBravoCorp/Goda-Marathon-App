import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { indexAt, pointAt, formatKm, formatMetres } from '../utils/gpx';

// Plot geometry in CSS pixels. The SVG is drawn at its measured width rather
// than stretched, so text and strokes keep their size at any width.
const HEIGHT = 172;
const PAD = { top: 24, right: 14, bottom: 26, left: 50 };
// A flat course must not be stretched into a mountain range: the elevation
// axis never spans less than this many metres.
const MIN_SPAN_M = 60;

const wholeFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

function formatChange(metres) {
  const rounded = Math.round(metres);
  if (rounded === 0) return '0 m';
  return `${rounded > 0 ? '+' : '−'}${wholeFormat.format(Math.abs(rounded))} m`;
}

// Whole kilometres unless the ticks are closer together than that.
const formatTick = (km, step) => (step < 1 ? formatKm(km * 1000) : `${wholeFormat.format(km)} km`);

/**
 * A round step (1, 2 or 5 × 10ⁿ) that splits `span` into about `count` parts.
 * Never 0, which would turn the tick loops below into infinite ones.
 */
function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

function layout(course, width) {
  const { points, along, distanceM, highIndex, lowIndex } = course;
  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  let lo = points[lowIndex].ele;
  let hi = points[highIndex].ele;
  if (hi - lo < MIN_SPAN_M) {
    const mid = (hi + lo) / 2;
    lo = mid - MIN_SPAN_M / 2;
    hi = mid + MIN_SPAN_M / 2;
  }
  // Four-ish steps keep the rounded axis close to the data; at three, a course
  // from 560 to 897 m got an axis from 400 to 1,000 m and half an empty plot.
  const yStep = niceStep(hi - lo, 4);
  const yMin = Math.floor(lo / yStep) * yStep;
  const yMax = Math.ceil(hi / yStep) * yStep;

  const x = (m) => PAD.left + (m / distanceM) * plotW;
  const y = (ele) => PAD.top + (1 - (ele - yMin) / (yMax - yMin)) * plotH;
  const base = PAD.top + plotH;

  let line = '';
  points.forEach((p, i) => { line += `${i ? 'L' : 'M'}${x(along[i]).toFixed(1)} ${y(p.ele).toFixed(1)}`; });
  const area = `${line}L${x(distanceM).toFixed(1)} ${base}L${PAD.left} ${base}Z`;

  const yTicks = [];
  for (let i = 0; yMin + i * yStep <= yMax; i++) yTicks.push(yMin + i * yStep);

  const km = distanceM / 1000;
  const kmStep = niceStep(km, Math.max(2, Math.floor(plotW / 72)));
  const xTicks = [];
  for (let i = 0; i * kmStep <= km + 1e-9; i++) xTicks.push(Number((i * kmStep).toFixed(3)));

  return { x, y, base, plotW, line, area, yTicks, xTicks, kmStep };
}

/** One row per kilometre plus the finish: the profile as a table. */
function kmRows(course) {
  const marks = [];
  for (let m = 0; m < course.distanceM; m += 1000) marks.push(m);
  // The finish, unless it lands within a few metres of the last kilometre.
  if (course.distanceM - marks[marks.length - 1] < 50) marks[marks.length - 1] = course.distanceM;
  else marks.push(course.distanceM);

  return marks.map((m, i) => ({
    m,
    ele: pointAt(course, m).ele,
    change: i ? pointAt(course, m).ele - pointAt(course, marks[i - 1]).ele : null,
  }));
}

/**
 * The course's elevation against distance. Hovering, dragging a finger along
 * it or moving through it with the arrow keys (it is a slider) picks a point,
 * which the map shows too. The table below carries the same numbers for
 * anyone who cannot see or point at the chart.
 */
export default function ElevationProfile({ course, activeIndex, onActiveChange, title }) {
  const plotRef = useRef(null);
  const [width, setWidth] = useState(0);
  const rangeId = useId();

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(plotRef.current);
    return () => observer.disconnect();
  }, []);

  const g = useMemo(() => (width > 0 ? layout(course, width) : null), [course, width]);
  const rows = useMemo(() => kmRows(course), [course]);

  const high = course.points[course.highIndex];
  const low = course.points[course.lowIndex];
  const highX = g ? g.x(course.along[course.highIndex]) : 0;

  const active = activeIndex != null ? course.points[activeIndex] : null;
  const activeM = activeIndex != null ? course.along[activeIndex] : 0;
  const stop = active ? course.waypoints.find(w => Math.abs(w.alongM - activeM) <= 75) : null;

  const pick = (clientX) => {
    if (!g) return;
    const rect = plotRef.current.getBoundingClientRect();
    const m = ((clientX - rect.left - PAD.left) / g.plotW) * course.distanceM;
    onActiveChange(indexAt(course, Math.min(course.distanceM, Math.max(0, m))));
  };

  const onKeyDown = (e) => {
    const last = course.points.length - 1;
    const current = activeIndex ?? 0;
    const step = Math.max(100, course.distanceM / 100);
    let target;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': target = course.along[current] + step; break;
      case 'ArrowLeft': case 'ArrowDown': target = course.along[current] - step; break;
      case 'PageUp': target = course.along[current] + 1000; break;
      case 'PageDown': target = course.along[current] - 1000; break;
      case 'Home': target = 0; break;
      case 'End': target = course.distanceM; break;
      case 'Escape': onActiveChange(null); return;
      default: return;
    }
    e.preventDefault();
    let next = indexAt(course, Math.min(course.distanceM, Math.max(0, target)));
    // Points far apart can snap back to the same one; a key press always moves.
    if (next === current && activeIndex != null && target !== course.along[current]) {
      next = Math.min(last, Math.max(0, current + (target > course.along[current] ? 1 : -1)));
    }
    onActiveChange(next);
  };

  let peakAnchor = 'middle';
  if (g && highX < PAD.left + 24) peakAnchor = 'start';
  else if (g && highX > width - PAD.right - 24) peakAnchor = 'end';
  // The readout sits where the label would; it says the same thing anyway.
  const peakCovered = g && active && Math.abs(g.x(activeM) - highX) < 80;

  return (
    <div className="elev">
      <div className="elev-head">
        <h5 className="elev-title">Elevation profile</h5>
        <p className="elev-range" id={rangeId}>
          Lowest {formatMetres(low.ele)} · highest {formatMetres(high.ele)}
        </p>
      </div>

      <div className="elev-plot" ref={plotRef}>
        {g && (
          <svg
            className="elev-svg"
            viewBox={`0 0 ${width} ${HEIGHT}`}
            height={HEIGHT}
            role="slider"
            tabIndex={0}
            aria-label={`Elevation along the ${title} course`}
            aria-describedby={rangeId}
            aria-valuemin={0}
            aria-valuemax={Math.round(course.distanceM / 100) / 10}
            aria-valuenow={Math.round(activeM / 100) / 10}
            aria-valuetext={active
              ? `${formatKm(activeM)}, ${formatMetres(active.ele)}${stop?.name ? `, ${stop.name}` : ''}`
              : 'Start of the course'}
            onPointerDown={(e) => pick(e.clientX)}
            onPointerMove={(e) => pick(e.clientX)}
            // A finger lifting keeps its point on show; a mouse leaving clears it.
            onPointerLeave={(e) => { if (e.pointerType === 'mouse') onActiveChange(null); }}
            onKeyDown={onKeyDown}
            onBlur={() => onActiveChange(null)}
          >
            <g className="elev-grid" aria-hidden="true">
              {g.yTicks.map(v => (
                <line key={v} x1={PAD.left} x2={width - PAD.right} y1={g.y(v)} y2={g.y(v)} />
              ))}
            </g>
            <g className="elev-axis" aria-hidden="true">
              {g.yTicks.map(v => (
                <text key={v} x={PAD.left - 8} y={g.y(v)} dy="0.32em" textAnchor="end">{formatMetres(v)}</text>
              ))}
              {g.xTicks.map(k => {
                const tx = g.x(k * 1000);
                const anchor = k === 0 ? 'start' : tx > width - PAD.right - 24 ? 'end' : 'middle';
                return <text key={k} x={tx} y={g.base + 18} textAnchor={anchor}>{formatTick(k, g.kmStep)}</text>;
              })}
            </g>

            <path className="elev-area" d={g.area} />
            <path className="elev-line" d={g.line} />

            {course.waypoints.map((w, i) => (
              <circle key={i} className="elev-stop" cx={g.x(w.alongM)} cy={g.y(pointAt(course, w.alongM).ele)} r={4} />
            ))}

            <circle className="elev-peak" cx={highX} cy={g.y(high.ele)} r={4} />
            {!peakCovered && (
              <text className="elev-peak-label" x={highX} y={g.y(high.ele) - 10} textAnchor={peakAnchor}>
                {formatMetres(high.ele)}
              </text>
            )}

            {active && (
              <g className="elev-cursor">
                <line x1={g.x(activeM)} x2={g.x(activeM)} y1={PAD.top} y2={g.base} />
                <circle cx={g.x(activeM)} cy={g.y(active.ele)} r={5} />
              </g>
            )}
          </svg>
        )}

        {g && active && (
          <div
            className="elev-tip"
            style={{ left: Math.min(width - 70, Math.max(70, g.x(activeM))) }}
            aria-hidden="true"
          >
            <strong>{formatMetres(active.ele)}</strong>
            <span>{formatKm(activeM)}{stop?.name ? ` · ${stop.name}` : ''}</span>
          </div>
        )}
      </div>

      <details className="elev-table">
        <summary>Elevation by kilometre</summary>
        <div className="elev-table-scroll">
          <table>
            <caption className="sr-only">Elevation of the {title} course at each kilometre</caption>
            <thead>
              <tr>
                <th scope="col">Distance</th>
                <th scope="col">Elevation</th>
                <th scope="col">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.m}>
                  <th scope="row">{formatKm(r.m)}</th>
                  <td>{formatMetres(r.ele)}</td>
                  <td>{r.change == null ? '—' : formatChange(r.change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
