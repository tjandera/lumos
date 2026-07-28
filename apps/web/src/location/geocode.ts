/**
 * Place search via Nominatim (OpenStreetMap's geocoder) — no API key, no billing.
 *
 * Usage policy (https://operations.osmfoundation.org/policies/nominatim/): at most
 * 1 request/second and no bulk querying, which is why every call site debounces
 * rather than searching on each keystroke. Browsers send a Referer automatically,
 * satisfying the identification requirement.
 *
 * Privacy note: the typed query string goes to a third party. That's inherent to
 * geocoding, but it's why we only ever send what the user explicitly typed — never
 * their existing pin coordinates or anything read from the document.
 */

export interface GeoResult {
  /** Human-readable place name, e.g. "Marina Bay Sands, Singapore". */
  label: string;
  lat: number;
  lng: number;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/** Nominatim returns lat/lon as *strings*, and any row can be malformed — parse
 *  defensively and drop anything that isn't a usable coordinate rather than
 *  letting a NaN reach the sun math, where it would silently produce no sun. */
export function parseNominatim(raw: unknown): GeoResult[] {
  if (!Array.isArray(raw)) return [];
  const out: GeoResult[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    const label = typeof r.display_name === 'string' ? r.display_name : '';
    if (!label) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    out.push({ label, lat, lng });
  }
  return out;
}

/**
 * Search for a place by name. Resolves to [] on any failure (offline, rate-limited,
 * malformed response) — a location picker that shows no results is recoverable;
 * one that throws mid-typing is not.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&format=jsonv2&limit=5&addressdetails=0`;
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    return parseNominatim(await res.json());
  } catch (err) {
    // An aborted request is the expected outcome of typing another character, not a fault.
    if (err instanceof DOMException && err.name === 'AbortError') return [];
    console.warn('[geocode] search failed', err);
    return [];
  }
}

/** Trim Nominatim's very long comma-separated names to something that fits a result row. */
export function shortLabel(label: string, maxParts = 3): string {
  const parts = label.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= maxParts) return parts.join(', ');
  return [...parts.slice(0, maxParts - 1), parts[parts.length - 1]!].join(', ');
}
