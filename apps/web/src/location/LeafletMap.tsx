import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { metersPerPixel } from './sunBearing';

/**
 * Leaflet driven imperatively rather than through react-leaflet.
 *
 * That's deliberate: react-leaflet pins itself to a React major (v4 → React 18,
 * v5 → React 19), and this app has already been bitten twice by a React wrapper
 * being subtly incompatible with the React version in use — see the manual
 * EffectComposer in Realism.tsx, which exists because @react-three/postprocessing's
 * wrapper crashes under R3F v9. Leaflet's own API is small and stable, so owning the
 * lifecycle here costs little and removes a whole class of upgrade breakage.
 */

export type MapLayer = 'street' | 'satellite';

/**
 * `maxNativeZoom` is where real tiles stop; `MAX_ZOOM` is how far the user may keep
 * zooming, with Leaflet upscaling the last tile level. Going past native zoom is
 * necessary here rather than cosmetic: a 5 m room at zoom 19 is only ~17 px across,
 * far too small to rotate accurately, and the room outline stays crisp while zooming
 * because it's SVG — only the aerial photo underneath gets soft.
 */
const MAX_ZOOM = 22;

const TILES: Record<MapLayer, { url: string; attribution: string; maxNativeZoom: number }> = {
  street: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 19,
  },
  // Aerial imagery matters here: you orient a room by recognising your own roof, which
  // a street map can't show you. Esri's World Imagery is free to use with attribution.
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 19,
  },
};

export interface Footprint {
  /** Room extent along world X, in metres. */
  width: number;
  /** Room extent along world Z, in metres. */
  depth: number;
}

export interface SunArrows {
  sunriseDeg: number;
  sunsetDeg: number;
}

interface Props {
  lat: number;
  lng: number;
  layer: MapLayer;
  onPick: (lat: number, lng: number) => void;
  footprint?: Footprint | null;
  /** Degrees the building is rotated clockwise from true north. */
  northOffsetDeg: number;
  sun?: SunArrows | null;
}

/** Pin marker. A divIcon avoids Leaflet's default-icon asset paths, which break under
 *  bundlers, and lets the pin match the app's own iconography. */
function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    html: `<svg viewBox="0 0 24 24" width="26" height="26" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))">
      <path d="M12 23s8-8.2 8-13a8 8 0 1 0-16 0c0 4.8 8 13 8 13z" fill="#38bdf8" stroke="#0c4a6e" stroke-width="1.5"/>
      <circle cx="12" cy="10" r="3" fill="#0c4a6e"/>
    </svg>`,
  });
}

/**
 * The room drawn at true scale over the imagery, plus true-north and sunrise/sunset
 * arrows. The room group rotates with `northOffsetDeg`; the compass and sun arrows do
 * not, because the map is north-up and the sun's bearing is a fact about the site, not
 * about which way the building was built.
 */
function overlayIcon(lat: number, zoom: number, footprint: Footprint | null, northOffsetDeg: number, sun: SunArrows | null): L.DivIcon {
  const mpp = metersPerPixel(lat, zoom);
  const w = footprint ? Math.max(6, footprint.width / mpp) : 0;
  const d = footprint ? Math.max(6, footprint.depth / mpp) : 0;
  const ray = Math.max(46, Math.hypot(w, d) * 0.75);
  const size = Math.ceil(Math.max(w, d, ray * 2) + 44);
  const c = size / 2;

  const arrow = (deg: number, color: string, label: string) => `
    <g transform="rotate(${deg} ${c} ${c})">
      <line x1="${c}" y1="${c}" x2="${c}" y2="${c - ray}" stroke="${color}" stroke-width="2"
            stroke-dasharray="4 3" opacity="0.95"/>
      <polygon points="${c},${c - ray - 7} ${c - 4.5},${c - ray + 2} ${c + 4.5},${c - ray + 2}" fill="${color}"/>
      <text x="${c}" y="${c - ray - 11}" fill="${color}" font-size="10" font-family="ui-sans-serif,system-ui"
            text-anchor="middle" style="paint-order:stroke;stroke:rgba(0,0,0,.65);stroke-width:3px">${label}</text>
    </g>`;

  const room = footprint
    ? `<g transform="rotate(${northOffsetDeg} ${c} ${c})">
         <rect x="${c - w / 2}" y="${c - d / 2}" width="${w}" height="${d}"
               fill="rgba(56,189,248,.22)" stroke="#38bdf8" stroke-width="2"/>
         <line x1="${c}" y1="${c}" x2="${c}" y2="${c - d / 2}" stroke="#38bdf8" stroke-width="1.5" opacity=".8"/>
       </g>`
    : '';

  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [c, c],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible;pointer-events:none">
      ${room}
      ${arrow(0, '#f87171', 'N')}
      ${sun ? arrow(sun.sunriseDeg, '#fbbf24', 'rise') : ''}
      ${sun ? arrow(sun.sunsetDeg, '#fb923c', 'set') : ''}
    </svg>`,
  });
}

export function LeafletMap({ lat, lng, layer, onPick, footprint = null, northOffsetDeg, sun = null }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const pinRef = useRef<L.Marker | null>(null);
  const overlayRef = useRef<L.Marker | null>(null);
  // Lets the position effect tell "the user clicked the map" (already where we want)
  // from "a search result moved the pin" (pan there), without a feedback loop.
  const selfSetRef = useRef<string>('');
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Create once. Everything else is applied by the effects below, so a prop change
  // never tears down and rebuilds the map (which would lose the user's pan/zoom).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Zoom control on the right: the app's own layer/location buttons sit top-left.
    const map = L.map(host, {
      center: [lat, lng],
      zoom: 19,
      maxZoom: MAX_ZOOM,
      zoomControl: false,
      attributionControl: true,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    mapRef.current = map;

    pinRef.current = L.marker([lat, lng], { icon: pinIcon(), keyboard: false }).addTo(map);
    overlayRef.current = L.marker([lat, lng], {
      icon: overlayIcon(lat, map.getZoom(), footprint, northOffsetDeg, sun),
      interactive: false,
      keyboard: false,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      selfSetRef.current = `${e.latlng.lat},${e.latlng.lng}`;
      onPickRef.current(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      pinRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the basemap without touching view state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    const spec = TILES[layer];
    tileRef.current = L.tileLayer(spec.url, {
      attribution: spec.attribution,
      maxZoom: MAX_ZOOM,
      maxNativeZoom: spec.maxNativeZoom,
    }).addTo(map);
    tileRef.current.bringToBack();
  }, [layer]);

  // Follow externally-driven position changes (search result, "my location", presets).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pinRef.current?.setLatLng([lat, lng]);
    overlayRef.current?.setLatLng([lat, lng]);
    if (selfSetRef.current === `${lat},${lng}`) return; // came from a map click; already in view
    map.setView([lat, lng], Math.max(map.getZoom(), 17));
  }, [lat, lng]);

  // The overlay is drawn in pixels, so it must be rebuilt whenever the metre-to-pixel
  // ratio changes (zoom, latitude) or its contents change (rotation, sun, footprint).
  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;
    const redraw = () => overlay.setIcon(overlayIcon(lat, map.getZoom(), footprint, northOffsetDeg, sun));
    redraw();
    map.on('zoomend', redraw);
    return () => {
      map.off('zoomend', redraw);
    };
  }, [lat, northOffsetDeg, footprint?.width, footprint?.depth, sun?.sunriseDeg, sun?.sunsetDeg, footprint, sun]);

  return <div ref={hostRef} className="h-full w-full rounded-lg" />;
}
