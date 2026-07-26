import { useState, type ReactNode } from 'react';
import { X, MapPin, Sun as SunIcon, Moon, Play, Pause, Check, Camera } from 'lucide-react';
import {
  daylightTimes,
  kelvinToRgb,
  ROOM_STANDARDS,
  FIXTURE_MOUNT_HEIGHT,
  type FixtureKind,
  type LightInstance,
} from '@interior/core';
import { useUiStore, type Quality, type SunMode, type Weather } from './uiStore';
import { useSceneStore } from './store';

const FIXTURE_LABEL: Record<FixtureKind, string> = { ceiling: 'Ceiling', wall: 'Wall', floor: 'Floor', table: 'Table' };

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

/** Collapsible group — the panel accumulated a lot of sections; keep the ones you
 * touch occasionally closed by default so the always-useful ones aren't buried. */
function Section({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="mt-3 border-t border-white/10 pt-2" open={defaultOpen}>
      <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wider text-white/40 hover:text-white/60">
        {title}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

const chip = (active: boolean) =>
  `rounded px-2 py-0.5 text-[11px] ${active ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-white/60 hover:bg-white/20'}`;

function FixtureRow({
  light,
  onIntensity,
  onKelvin,
  onFlag,
  onDelete,
}: {
  light: LightInstance;
  onIntensity: (v: number) => void;
  onKelvin: (v: number) => void;
  onFlag: (field: 'on' | 'castShadow' | 'auto', v: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-2 rounded bg-white/5 p-1.5">
      <div className="flex items-center justify-between text-[11px] text-white/60">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: light.on ? light.color : '#555', boxShadow: light.on ? `0 0 5px ${light.color}` : 'none' }}
          />
          {FIXTURE_LABEL[light.kind]}
        </span>
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={light.on} onChange={(e) => onFlag('on', e.target.checked)} />
            on
          </label>
          <button className="px-1 text-red-300 hover:text-red-200" onClick={onDelete}>
            <X size={12} />
          </button>
        </div>
      </div>

      <label className="mt-1.5 block text-[10px] text-white/50">
        <div className="mb-0.5 flex justify-between">
          <span>Kelvin</span>
          <span className="font-mono text-white/70">{Math.round(light.kelvin)}K</span>
        </div>
        <input
          type="range"
          min={2700}
          max={6500}
          step={50}
          value={light.kelvin}
          onChange={(e) => onKelvin(Number(e.target.value))}
          className="h-1 w-full cursor-pointer accent-amber-400"
        />
      </label>

      <label className="mt-1.5 block text-[10px] text-white/50">
        <div className="mb-0.5 flex justify-between">
          <span>Brightness</span>
          <span className="font-mono text-white/70">{light.intensityCandela}</span>
        </div>
        <input
          type="range"
          min={0}
          max={800}
          step={10}
          value={light.intensityCandela}
          onChange={(e) => onIntensity(Number(e.target.value))}
          className="h-1 w-full cursor-pointer accent-amber-400"
        />
      </label>

      <div className="mt-1.5 flex gap-3 text-[10px] text-white/50">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={light.castShadow} onChange={(e) => onFlag('castShadow', e.target.checked)} />
          Shadow
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={light.auto} onChange={(e) => onFlag('auto', e.target.checked)} />
          Auto (dusk)
        </label>
      </div>
    </div>
  );
}

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
  const timeMinutes = useUiStore((s) => s.timeMinutes);
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
  const enhancedRealism = useUiStore((s) => s.enhancedRealism);
  const toggleEnhancedRealism = useUiStore((s) => s.toggleEnhancedRealism);
  const photoRequested = useUiStore((s) => s.photoRequested);
  const photoBusy = useUiStore((s) => s.photoBusy);
  const photoResult = useUiStore((s) => s.photoResult);
  const requestPhoto = useUiStore((s) => s.requestPhoto);
  const clearPhotoResult = useUiStore((s) => s.clearPhotoResult);
  const justImportedRoom = useUiStore((s) => s.justImportedRoom);
  const dismissJustImported = useUiStore((s) => s.dismissJustImported);
  const photoGps = useUiStore((s) => s.photoGps);

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
  const addFixture = (kind: FixtureKind) => {
    const c = roomCenter();
    const kelvin = 2700;
    edit((d) => {
      d.lights.push({
        id: crypto.randomUUID(),
        kind,
        position: { x: c.x, y: FIXTURE_MOUNT_HEIGHT[kind], z: c.z },
        intensityCandela: 300,
        color: kelvinToRgb(kelvin),
        kelvin,
        on: true,
        castShadow: true,
        auto: false,
      });
    });
  };
  const setLampIntensity = (id: string, v: number) =>
    edit((d) => { const l = d.lights.find((x) => x.id === id); if (l) l.intensityCandela = v; });
  const setLampKelvin = (id: string, k: number) =>
    edit((d) => {
      const l = d.lights.find((x) => x.id === id);
      if (l) {
        l.kelvin = k;
        l.color = kelvinToRgb(k);
      }
    });
  const setLampFlag = (id: string, field: 'on' | 'castShadow' | 'auto', v: boolean) =>
    edit((d) => { const l = d.lights.find((x) => x.id === id); if (l) l[field] = v; });
  const removeLamp = (id: string) => edit((d) => { d.lights = d.lights.filter((x) => x.id !== id); });

  // --- Lighting scenes: snapshot the current mood, recall it later ---
  const [sceneName, setSceneName] = useState('');
  const captureScene = (name: string) => ({
    id: crypto.randomUUID(),
    name,
    sunMode,
    timeMinutes,
    weather,
    sunIntensity: intensity,
    exposure,
    sunWarmth,
    lights: doc.lights.map((l) => ({ id: l.id, on: l.on, intensityCandela: l.intensityCandela, kelvin: l.kelvin })),
  });
  const applyScene = (scene: {
    sunMode: SunMode;
    timeMinutes: number;
    weather: Weather;
    sunIntensity: number;
    exposure: number;
    sunWarmth: number;
    lights: { id: string; on: boolean; intensityCandela: number; kelvin: number }[];
  }) => {
    setSunMode(scene.sunMode);
    setTimeMinutes(scene.timeMinutes);
    setWeather(scene.weather);
    setSunIntensity(scene.sunIntensity);
    setExposure(scene.exposure);
    setSunWarmth(scene.sunWarmth);
    edit((d) => {
      for (const snap of scene.lights) {
        const l = d.lights.find((x) => x.id === snap.id);
        if (l) {
          l.on = snap.on;
          l.intensityCandela = snap.intensityCandela;
          l.kelvin = snap.kelvin;
          l.color = kelvinToRgb(snap.kelvin);
        }
      }
    });
  };
  const saveScene = () => {
    const name = sceneName.trim();
    if (!name) return;
    edit((d) => {
      d.lightingScenes.push(captureScene(name));
    });
    setSceneName('');
  };
  const deleteScene = (id: string) => edit((d) => { d.lightingScenes = d.lightingScenes.filter((s) => s.id !== id); });

  // Built-in one-click moods (interior-focused; complements the Sun-study time presets).
  const quickScenes: Record<string, () => void> = {
    Evening: () => {
      setSunAngles(250, 4); // low golden-hour sun
      applyScene({
        sunMode: 'manual',
        timeMinutes,
        weather: 'clear',
        sunIntensity: 0.3,
        exposure: 1,
        sunWarmth: 0.5,
        lights: doc.lights.map((l) => ({ id: l.id, on: true, intensityCandela: Math.max(l.intensityCandela, 250), kelvin: 2400 })),
      });
    },
    Reading: () =>
      applyScene({
        sunMode,
        timeMinutes,
        weather,
        sunIntensity: intensity,
        exposure: 1.1,
        sunWarmth,
        lights: doc.lights.map((l) => ({ id: l.id, on: true, intensityCandela: Math.max(l.intensityCandela, 500), kelvin: 4000 })),
      }),
    Movie: () => {
      setSunAngles(0, -5); // below the horizon — night
      applyScene({
        sunMode: 'manual',
        timeMinutes,
        weather: 'overcast',
        sunIntensity: 0.2,
        exposure: 0.75,
        sunWarmth: 0.2,
        lights: doc.lights.map((l) => ({ id: l.id, on: false, intensityCandela: l.intensityCandela, kelvin: l.kelvin })),
      });
    },
  };

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
          <Section title="Location" defaultOpen={justImportedRoom}>
            {justImportedRoom && (
              <div className="mb-2 rounded bg-amber-500/10 p-1.5 text-[11px] leading-snug text-amber-200">
                This room was imported from a photo — set its real location and which way it
                faces below so the sunlight simulation matches your actual space.
                <button className="mt-1 block text-amber-100 underline hover:no-underline" onClick={dismissJustImported}>
                  Got it
                </button>
              </div>
            )}
            {photoGps && (
              <button
                className={`${chip(false)} mb-1.5 inline-flex w-full items-center justify-center gap-1`}
                onClick={() => setCity(photoGps.lat, photoGps.lng)}
                title="Read from the uploaded photo's EXIF data, client-side only"
              >
                <MapPin size={12} /> Use photo's location ({photoGps.lat.toFixed(2)}, {photoGps.lng.toFixed(2)})
              </button>
            )}
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
            <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-white/55">
              <span className="inline-flex items-center gap-1">
                <SunIcon size={11} /> {hm(times.sunrise)}
              </span>
              <span>{times.dayLengthHours.toFixed(1)}h</span>
              <span className="inline-flex items-center gap-1">
                {hm(times.sunset)} <Moon size={11} />
              </span>
            </div>
          </Section>

          <Section title="Sun study">
            <div className="flex items-center gap-2">
              <button
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${playing ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 hover:bg-white/20'}`}
                onClick={togglePlaying}
              >
                {playing ? (
                  <>
                    <Pause size={12} /> Pause
                  </>
                ) : (
                  <>
                    <Play size={12} /> Play
                  </>
                )}
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

      <Section title="Sky" defaultOpen>
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

      <Section title="Orientation" defaultOpen={justImportedRoom}>
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
        {justImportedRoom && (
          <p className="mt-1.5 text-[11px] leading-snug text-white/40">
            Which way does the wall with the window(s) actually face? Rotate this until the
            sun in the 3D view matches what you'd expect at that time of day.
          </p>
        )}
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
              <div className={`inline-flex items-center gap-1 ${avgLux >= standardLux ? 'text-emerald-300' : 'text-amber-300'}`}>
                {avgLux >= standardLux ? <Check size={12} /> : <X size={12} />}
                {avgLux >= standardLux ? 'meets' : 'below'} ~{standardLux} lx
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title="Light fixtures" defaultOpen>
        <div className="flex flex-wrap gap-1">
          {(['ceiling', 'wall', 'floor', 'table'] as FixtureKind[]).map((k) => (
            <button key={k} className={chip(false)} onClick={() => addFixture(k)}>
              + {FIXTURE_LABEL[k]}
            </button>
          ))}
        </div>
        {lamps.map((l) => (
          <FixtureRow
            key={l.id}
            light={l}
            onIntensity={(v) => setLampIntensity(l.id, v)}
            onKelvin={(v) => setLampKelvin(l.id, v)}
            onFlag={(f, v) => setLampFlag(l.id, f, v)}
            onDelete={() => removeLamp(l.id)}
          />
        ))}
      </Section>

      <Section title="Scenes">
        <div className="flex flex-wrap gap-1">
          {Object.keys(quickScenes).map((name) => (
            <button key={name} className={chip(false)} onClick={quickScenes[name]}>
              {name}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-1">
          <input
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            placeholder="Scene name…"
            className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 text-xs placeholder:text-white/30"
          />
          <button className={chip(false)} onClick={saveScene}>
            Save
          </button>
        </div>
        {doc.lightingScenes.length > 0 && (
          <div className="mt-2 space-y-1">
            {doc.lightingScenes.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded bg-white/5 px-1.5 py-1 text-xs">
                <span className="truncate text-white/70">{s.name}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button className="text-amber-300 hover:text-amber-200" onClick={() => applyScene(s)}>
                    Apply
                  </button>
                  <button className="px-1 text-red-300 hover:text-red-200" onClick={() => deleteScene(s.id)}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Realism">
        <label className="flex items-center gap-2 text-xs text-white/60">
          <input type="checkbox" checked={enhancedRealism} onChange={toggleEnhancedRealism} />
          Ambient occlusion + reflections + bloom
        </label>
        <p className="mt-1.5 text-[11px] leading-snug text-white/40">
          Real-time, not offline path-traced GI — heavier than the default view, so it's
          opt-in. Full multi-bounce global illumination is a larger future step.
        </p>
      </Section>

      <Section title="Photo mode">
        <button
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm ${
            photoBusy ? 'bg-white/10 text-white/40' : 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
          }`}
          disabled={photoBusy}
          onClick={requestPhoto}
        >
          {photoBusy ? (
            'Rendering…'
          ) : (
            <>
              <Camera size={14} /> Render photo
            </>
          )}
        </button>
        <p className="mt-1.5 text-[11px] leading-snug text-white/40">
          A one-shot high-quality capture — every setting maxed, higher resolution. Not
          offline path tracing.
        </p>
        {photoResult && !photoRequested && (
          <div className="mt-2">
            <img src={photoResult} alt="Rendered photo" className="w-full rounded border border-white/15" />
            <div className="mt-1.5 flex gap-2">
              <a
                href={photoResult}
                download="interior-photo.png"
                className="flex-1 rounded bg-white/10 px-2 py-1 text-center text-xs hover:bg-white/20"
              >
                Download PNG
              </a>
              <button className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20" onClick={clearPhotoResult}>
                <X size={12} />
              </button>
            </div>
          </div>
        )}
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
