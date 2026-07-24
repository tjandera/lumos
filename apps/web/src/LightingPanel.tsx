import type { ReactNode } from 'react';
import { daylightTimes, ROOM_STANDARDS } from '@interior/core';
import { useUiStore, type Quality, type SunMode, type Weather } from './uiStore';
import { useSceneStore } from './store';

const CITIES = [
  { name: 'Singapore', lat: 1.2966, lng: 103.8764 },
  { name: 'New York', lat: 40.7128, lng: -74.006 },
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date | null) => (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—');
const minsOf = (d: Date | null, fallback: number) => (d ? d.getHours() * 60 + d.getMinutes() : fallback);
const toLocalISO = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

function MiniSlider({
  label,
  min,
  max,
  step,
  value,
  suffix,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-2 block text-xs text-white/60">
      <div className="mb-0.5 flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-white/80">
          {Math.round(value * 100) / 100}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer accent-amber-400"
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3 border-t border-white/10 pt-2">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">{title}</div>
      {children}
    </div>
  );
}

const chip = (active: boolean) =>
  `rounded px-2 py-0.5 text-[11px] ${active ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-white/60 hover:bg-white/20'}`;

export function LightingPanel() {
  const sunMode = useUiStore((s) => s.sunMode);
  const setSunMode = useUiStore((s) => s.setSunMode);
  const az = useUiStore((s) => s.sunAzimuthDeg);
  const el = useUiStore((s) => s.sunElevationDeg);
  const setSunAngles = useUiStore((s) => s.setSunAngles);
  const intensity = useUiStore((s) => s.sunIntensity);
  const setSunIntensity = useUiStore((s) => s.setSunIntensity);
  const showSun = useUiStore((s) => s.showSun);
  const toggleShowSun = useUiStore((s) => s.toggleShowSun);
  const showSunPath = useUiStore((s) => s.showSunPath);
  const toggleSunPath = useUiStore((s) => s.toggleSunPath);
  const quality = useUiStore((s) => s.quality);
  const setQuality = useUiStore((s) => s.setQuality);
  const setTimeMinutes = useUiStore((s) => s.setTimeMinutes);
  const playing = useUiStore((s) => s.playing);
  const togglePlaying = useUiStore((s) => s.togglePlaying);
  const showSeasons = useUiStore((s) => s.showSeasons);
  const toggleSeasons = useUiStore((s) => s.toggleSeasons);
  const weather = useUiStore((s) => s.weather);
  const setWeather = useUiStore((s) => s.setWeather);
  const exposure = useUiStore((s) => s.exposure);
  const setExposure = useUiStore((s) => s.setExposure);
  const sunWarmth = useUiStore((s) => s.sunWarmth);
  const setSunWarmth = useUiStore((s) => s.setSunWarmth);
  const heatmapOn = useUiStore((s) => s.heatmapOn);
  const toggleHeatmap = useUiStore((s) => s.toggleHeatmap);
  const luxOn = useUiStore((s) => s.luxOn);
  const toggleLux = useUiStore((s) => s.toggleLux);
  const avgLux = useUiStore((s) => s.avgLux);
  const roomStandardId = useUiStore((s) => s.roomStandardId);
  const setRoomStandardId = useUiStore((s) => s.setRoomStandardId);
  const standardLux = ROOM_STANDARDS.find((r) => r.id === roomStandardId)?.targetLux ?? 150;

  const doc = useSceneStore((s) => s.doc);
  const edit = useSceneStore((s) => s.edit);
  const site = doc.site;
  const dateObj = new Date(doc.view.timeOfDay);
  const times = daylightTimes(site.lat, site.lng, dateObj);

  const setCity = (lat: number, lng: number) => edit((d) => { d.site.lat = lat; d.site.lng = lng; });
  const setOrientation = (deg: number) => edit((d) => { d.site.trueNorthOffsetDeg = ((deg % 360) + 360) % 360; });
  const setDate = (iso: string) => {
    if (!iso) return;
    const [y, m, day] = iso.split('-').map(Number);
    edit((d) => {
      const cur = new Date(d.view.timeOfDay);
      d.view.timeOfDay = toLocalISO(new Date(y, m - 1, day, cur.getHours(), cur.getMinutes()));
    });
  };

  const lamps = doc.lights;
  const roomCenter = () => {
    const xs: number[] = [];
    const zs: number[] = [];
    for (const r of doc.rooms) for (const w of r.walls) { xs.push(w.start.x, w.end.x); zs.push(w.start.z, w.end.z); }
    return {
      x: xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0,
      z: zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0,
    };
  };
  const addLamp = () => {
    const c = roomCenter();
    edit((d) =>
      d.lights.push({ id: crypto.randomUUID(), kind: 'lamp', position: { x: c.x, y: 2.2, z: c.z }, intensityCandela: 300, color: '#ffe6b0' }),
    );
  };
  const setLampIntensity = (id: string, v: number) =>
    edit((d) => { const l = d.lights.find((x) => x.id === id); if (l) l.intensityCandela = v; });
  const setLampColor = (id: string, hex: string) =>
    edit((d) => { const l = d.lights.find((x) => x.id === id); if (l) l.color = hex; });
  const removeLamp = (id: string) => edit((d) => { d.lights = d.lights.filter((x) => x.id !== id); });

  const presets: [string, number][] = [
    ['Sunrise', minsOf(times.sunrise, 6 * 60)],
    ['Noon', minsOf(times.solarNoon, 12 * 60)],
    ['Golden', minsOf(times.sunset, 18 * 60) - 40],
    ['Sunset', minsOf(times.sunset, 18 * 60)],
  ];

  const seg = (active: boolean) =>
    `flex-1 px-2 py-1 text-xs ${active ? 'bg-amber-500/25 text-amber-200' : 'text-white/60 hover:bg-white/10'}`;

  return (
    <div className="absolute left-3 top-16 max-h-[calc(100vh-6rem)] w-64 overflow-y-auto rounded-xl bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Lighting</div>

      <div className="flex overflow-hidden rounded-md border border-white/15">
        {(['auto', 'manual'] as SunMode[]).map((m) => (
          <button key={m} className={seg(sunMode === m)} onClick={() => setSunMode(m)}>
            {m === 'auto' ? 'Auto (time)' : 'Manual'}
          </button>
        ))}
      </div>

      {sunMode === 'auto' ? (
        <>
          <Section title="Location">
            <div className="flex flex-wrap gap-1">
              {CITIES.map((c) => (
                <button key={c.name} className={chip(false)} onClick={() => setCity(c.lat, c.lng)}>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="mt-1 font-mono text-[10px] text-white/40">
              {site.lat.toFixed(2)}, {site.lng.toFixed(2)}
            </div>
          </Section>

          <Section title="Date">
            <input
              type="date"
              value={ymd(dateObj)}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded bg-white/10 px-2 py-1 text-xs [color-scheme:dark]"
            />
            <div className="mt-1.5 flex justify-between font-mono text-[11px] text-white/55">
              <span>☀ {hm(times.sunrise)}</span>
              <span>{times.dayLengthHours.toFixed(1)}h</span>
              <span>{hm(times.sunset)} ☾</span>
            </div>
          </Section>

          <Section title="Sun study">
            <div className="flex items-center gap-2">
              <button
                className={`rounded-md px-2 py-1 text-xs ${playing ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 hover:bg-white/20'}`}
                onClick={togglePlaying}
              >
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <span className="text-[10px] text-white/40">sweep the day</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {presets.map(([label, mins]) => (
                <button key={label} className={chip(false)} onClick={() => setTimeMinutes(((mins % 1440) + 1440) % 1440)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
              <input type="checkbox" checked={showSeasons} onChange={toggleSeasons} />
              Summer / winter paths
            </label>
          </Section>
        </>
      ) : (
        <>
          <MiniSlider label="Direction" min={0} max={360} step={1} value={az} suffix="°" onChange={(v) => setSunAngles(v, el)} />
          <MiniSlider label="Height" min={0} max={90} step={1} value={el} suffix="°" onChange={(v) => setSunAngles(az, v)} />
        </>
      )}

      <Section title="Sky">
        <div className="flex flex-wrap gap-1">
          {(['clear', 'hazy', 'overcast', 'golden'] as Weather[]).map((w) => (
            <button key={w} className={chip(weather === w)} onClick={() => setWeather(w)}>
              {w[0].toUpperCase() + w.slice(1)}
            </button>
          ))}
        </div>
      </Section>

      <MiniSlider label="Intensity" min={0.2} max={2} step={0.05} value={intensity} suffix="×" onChange={setSunIntensity} />
      <MiniSlider label="Exposure" min={0.5} max={1.6} step={0.05} value={exposure} suffix="×" onChange={setExposure} />
      <MiniSlider label="Warmth" min={-1} max={1} step={0.05} value={sunWarmth} onChange={setSunWarmth} />

      <Section title="Orientation">
        <label className="flex items-center justify-between text-xs text-white/60">
          <span>Building faces (° from N)</span>
          <input
            type="number"
            value={Math.round(site.trueNorthOffsetDeg)}
            min={0}
            max={359}
            onChange={(e) => setOrientation(Number(e.target.value))}
            className="w-16 rounded bg-white/10 px-2 py-1 text-right font-mono text-xs [color-scheme:dark]"
          />
        </label>
      </Section>

      <label className="mt-3 flex items-center gap-2 text-xs text-white/60">
        <input type="checkbox" checked={showSun} onChange={toggleShowSun} />
        Show sun in scene
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
        <input type="checkbox" checked={showSunPath} onChange={toggleSunPath} />
        Sun path &amp; compass
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
        <input type="checkbox" checked={heatmapOn} onChange={toggleHeatmap} />
        Sun-exposure heatmap
      </label>
      {heatmapOn && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-white/40">
          <span className="h-2 w-8 rounded" style={{ background: 'linear-gradient(90deg,#3b82f6,#22c55e,#eab308,#ef4444)' }} />
          shade → full sun
        </div>
      )}

      <Section title="Analysis">
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={luxOn} onChange={toggleLux} />
          Illuminance heatmap (lux)
        </label>
        {luxOn && (
          <div className="mt-2">
            <div className="flex items-center gap-1 text-[10px] text-white/40">
              <span
                className="h-2 w-8 rounded"
                style={{ background: 'linear-gradient(90deg,#3b82f6,#22c55e,#eab308,#ef4444)' }}
              />
              dim → bright
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {ROOM_STANDARDS.map((r) => (
                <button key={r.id} className={chip(roomStandardId === r.id)} onClick={() => setRoomStandardId(r.id)}>
                  {r.name}
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs">
              <div className="text-white/60">
                Baseline <span className="font-mono text-white/85">{avgLux} lx</span>{' '}
                <span className="text-white/35">(no direct sun)</span>
              </div>
              <div className={avgLux >= standardLux ? 'text-emerald-300' : 'text-amber-300'}>
                {avgLux >= standardLux ? '✓ meets' : '✗ below'} ~{standardLux} lx
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title="Interior lamps">
        <button className={chip(false)} onClick={addLamp}>
          + Add lamp
        </button>
        {lamps.map((l, i) => (
          <div key={l.id} className="mt-2 rounded bg-white/5 p-1.5">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Lamp {i + 1}</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={l.color}
                  onChange={(e) => setLampColor(l.id, e.target.value)}
                  className="h-5 w-6 cursor-pointer rounded bg-transparent"
                />
                <button className="px-1 text-red-300 hover:text-red-200" onClick={() => removeLamp(l.id)}>
                  ✕
                </button>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={800}
              step={10}
              value={l.intensityCandela}
              onChange={(e) => setLampIntensity(l.id, Number(e.target.value))}
              className="mt-1 h-1 w-full cursor-pointer accent-amber-400"
            />
          </div>
        ))}
      </Section>

      <Section title="Quality">
        <div className="flex overflow-hidden rounded-md border border-white/15">
          {(['low', 'med', 'high'] as Quality[]).map((q) => (
            <button key={q} className={seg(quality === q)} onClick={() => setQuality(q)}>
              {q === 'low' ? 'Low' : q === 'med' ? 'Med' : 'High'}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
