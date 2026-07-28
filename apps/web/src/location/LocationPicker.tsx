import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Crosshair, MapPin, Loader2, Sunrise, Sunset } from 'lucide-react';
import { useSceneStore } from '../store';
import { useUiStore } from '../uiStore';
import { LeafletMap, type MapLayer } from './LeafletMap';
import { searchPlaces, shortLabel, type GeoResult } from './geocode';
import { compassLabel, sunriseSunsetBearings } from './sunBearing';

const CITIES = [
  { name: 'Singapore', lat: 1.2966, lng: 103.8764 },
  { name: 'New York', lat: 40.7128, lng: -74.006 },
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
];

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Pick where the room actually is, on a real map, and turn it to face the way the real
 * building faces. Everything downstream — sun position, shadow direction, the daylight
 * readout — is already driven by `site.lat/lng/trueNorthOffsetDeg`; this just makes
 * those three numbers something you can point at instead of type.
 *
 * Edits are held as local draft state and only committed to the document on "Use this
 * location", so cancelling leaves the scene untouched and confirming is a single
 * undoable change rather than one per map click.
 */
export function LocationPicker() {
  const open = useUiStore((s) => s.locationOpen);
  const setOpen = useUiStore((s) => s.setLocationOpen);
  const doc = useSceneStore((s) => s.doc);
  const edit = useSceneStore((s) => s.edit);

  const [lat, setLat] = useState(doc.site.lat);
  const [lng, setLng] = useState(doc.site.lng);
  const [north, setNorth] = useState(doc.site.trueNorthOffsetDeg);
  const [layer, setLayer] = useState<MapLayer>('satellite');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Re-seed the draft from the document each time the dialog opens, so it always
  // starts from the current truth rather than a stale draft from a cancelled edit.
  useEffect(() => {
    if (!open) return;
    setLat(doc.site.lat);
    setLng(doc.site.lng);
    setNorth(doc.site.trueNorthOffsetDeg);
    setQuery('');
    setResults([]);
    setGeoError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced search. Nominatim asks for at most 1 request/second, so this waits for a
  // pause in typing and aborts the in-flight request when another character arrives.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const found = await searchPlaces(q, ctrl.signal);
      if (!ctrl.signal.aborted) {
        setResults(found);
        setSearching(false);
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // The room drawn to scale on the map, from the plan's own wall extents.
  const footprint = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    for (const room of doc.rooms) for (const w of room.walls) { xs.push(w.start.x, w.end.x); zs.push(w.start.z, w.end.z); }
    if (xs.length === 0) return null;
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...zs) - Math.min(...zs);
    return width > 0 && depth > 0 ? { width, depth } : null;
  }, [doc.rooms]);

  const sun = useMemo(
    () => sunriseSunsetBearings(lat, lng, new Date(doc.view.timeOfDay)),
    [lat, lng, doc.view.timeOfDay],
  );

  if (!open) return null;

  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('This browser has no location support.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      (err) => setGeoError(err.code === err.PERMISSION_DENIED ? 'Location permission denied.' : 'Could not get your location.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const apply = () => {
    edit((d) => {
      d.site.lat = lat;
      d.site.lng = lng;
      d.site.trueNorthOffsetDeg = north;
    });
    setOpen(false);
  };

  const chip = (active: boolean) =>
    `rounded px-2 py-0.5 text-[11px] ${active ? 'bg-sky-500/25 text-sky-200' : 'bg-white/10 text-white/60 hover:bg-white/20'}`;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
      <div
        className="flex h-full max-h-[46rem] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold text-white">Where is this room?</h2>
            <p className="text-[11px] text-white/45">
              Sunlight is simulated from the real sun for this spot — find your building, then turn the room to match it.
            </p>
          </div>
          <button className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white/90" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>

        <div className="relative border-b border-white/10 px-4 py-2">
          <Search size={13} className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search an address, postcode or landmark…"
            className="w-full rounded-md bg-white/10 py-1.5 pl-7 pr-8 text-xs text-white placeholder:text-white/30 outline-none focus:bg-white/15"
          />
          {searching && <Loader2 size={13} className="absolute right-6 top-1/2 -translate-y-1/2 animate-spin text-white/40" />}
          {results.length > 0 && (
            <ul className="absolute left-4 right-4 top-full z-10 max-h-52 overflow-y-auto rounded-md border border-white/10 bg-neutral-800 shadow-xl">
              {results.map((r, i) => (
                <li key={`${r.lat},${r.lng},${i}`}>
                  <button
                    className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
                    onClick={() => {
                      setLat(r.lat);
                      setLng(r.lng);
                      setResults([]);
                      setQuery(shortLabel(r.label));
                    }}
                  >
                    <MapPin size={12} className="mt-0.5 shrink-0 text-sky-300" />
                    <span>{shortLabel(r.label)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative min-h-0 flex-1">
          <LeafletMap
            lat={lat}
            lng={lng}
            layer={layer}
            onPick={(la, ln) => { setLat(la); setLng(ln); }}
            footprint={footprint}
            northOffsetDeg={north}
            sun={sun}
          />
          <div className="pointer-events-none absolute left-2 top-2 z-[400] flex flex-col gap-1.5">
            <div className="pointer-events-auto flex overflow-hidden rounded-md border border-white/15 bg-black/70 backdrop-blur">
              {(['satellite', 'street'] as MapLayer[]).map((l) => (
                <button
                  key={l}
                  className={`px-2 py-1 text-[11px] ${layer === l ? 'bg-sky-500/30 text-sky-100' : 'text-white/60 hover:bg-white/10'}`}
                  onClick={() => setLayer(l)}
                >
                  {l === 'satellite' ? 'Satellite' : 'Street'}
                </button>
              ))}
            </div>
            <button
              className="pointer-events-auto inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white/75 backdrop-blur hover:bg-black/85"
              onClick={useMyLocation}
            >
              <Crosshair size={12} /> My location
            </button>
            <div className="pointer-events-auto flex flex-wrap gap-1">
              {CITIES.map((c) => (
                <button key={c.name} className={`${chip(false)} bg-black/70 backdrop-blur`} onClick={() => { setLat(c.lat); setLng(c.lng); }}>
                  {c.name}
                </button>
              ))}
            </div>
            {geoError && <span className="pointer-events-auto rounded bg-red-500/80 px-2 py-1 text-[11px] text-white">{geoError}</span>}
          </div>
          <p className="pointer-events-none absolute bottom-1 left-2 z-[400] rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/60">
            Click the map to drop the pin
          </p>
        </div>

        <div className="border-t border-white/10 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex min-w-[15rem] flex-1 items-center gap-2 text-xs text-white/70">
              <span className="shrink-0">Building faces</span>
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                value={north}
                onChange={(e) => setNorth(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-sky-400"
              />
              <input
                type="number"
                min={0}
                max={359}
                value={Math.round(north)}
                onChange={(e) => setNorth(((Number(e.target.value) % 360) + 360) % 360)}
                className="w-14 rounded bg-white/10 px-1 py-0.5 text-right font-mono text-xs text-white outline-none"
              />
              <span className="shrink-0 font-mono text-white/45">°</span>
            </label>

            {sun ? (
              <div className="flex items-center gap-3 font-mono text-[11px] text-white/55">
                <span className="inline-flex items-center gap-1">
                  <Sunrise size={12} className="text-amber-300" /> {hm(sun.sunrise)} {compassLabel(sun.sunriseDeg)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Sunset size={12} className="text-orange-300" /> {hm(sun.sunset)} {compassLabel(sun.sunsetDeg)}
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-white/45">The sun doesn’t rise or set here on this date.</span>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            <span className="font-mono text-[10px] text-white/35">
              {lat.toFixed(5)}, {lng.toFixed(5)} · shared as {lat.toFixed(2)}, {lng.toFixed(2)}
            </span>
            <div className="flex gap-2">
              <button className="rounded-md px-3 py-1 text-xs text-white/60 hover:bg-white/10" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="rounded-md bg-sky-500/85 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500" onClick={apply}>
                Use this location
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
