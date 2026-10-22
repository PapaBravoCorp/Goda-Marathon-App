/**
 * Reading category distances, which are free text in Admin -> Categories
 * ("15km", "21.1 km", "500m"). Shared by the homepage hero and the admin
 * Website tab, which previews what the hero's Distances box will say.
 */

/** Leading number out of "15km" / "300m" — NaN-safe for free-text values. */
export function toNumber(value) {
  const n = parseFloat(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** A category distance in km: "15km" → 15, "300m" → 0.3. Unreadable text is 0. */
export function toKm(value) {
  const text = String(value ?? '').toLowerCase();
  const n = toNumber(text);
  return /\d\s*m\b/.test(text) && !text.includes('km') ? n / 1000 : n;
}

const formatKm = (n) => String(Number(n.toFixed(1)));

/** [3, 5, 21] → "3–21 km"; null when no distance could be read. */
export function describeDistanceRange(distancesKm) {
  if (distancesKm.length === 0) return null;
  const min = Math.min(...distancesKm);
  const max = Math.max(...distancesKm);
  return min === max ? `${formatKm(max)} km` : `${formatKm(min)}–${formatKm(max)} km`;
}

/**
 * Each category's distance as a short label, shortest first, once each:
 * ["3K", "5K", "10K", "15K", "21K"]. A distance that cannot be read as a
 * number keeps its own text, so nothing silently disappears.
 */
export function distanceLabels(categories) {
  const items = categories
    .map(c => {
      const km = toKm(c.distance);
      if (km > 0) return { km, label: km < 1 ? `${Math.round(km * 1000)}M` : `${formatKm(km)}K` };
      const raw = String(c.distance || '').trim();
      return raw ? { km: Infinity, label: raw.toUpperCase() } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.km - b.km);

  return [...new Set(items.map(i => i.label))];
}
