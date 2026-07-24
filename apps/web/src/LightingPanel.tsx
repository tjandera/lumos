import { useUiStore, type Quality, type SunMode } from './uiStore';

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

  const seg = (active: boolean) =>
    `flex-1 px-2 py-1 text-xs ${active ? 'bg-amber-500/25 text-amber-200' : 'text-white/60 hover:bg-white/10'}`;

  return (
    <div className="absolute left-3 top-16 w-64 rounded-xl bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Lighting</div>

      <div className="flex overflow-hidden rounded-md border border-white/15">
        {(['auto', 'manual'] as SunMode[]).map((m) => (
          <button key={m} className={seg(sunMode === m)} onClick={() => setSunMode(m)}>
            {m === 'auto' ? 'Auto (time)' : 'Manual'}
          </button>
        ))}
      </div>

      {sunMode === 'auto' ? (
        <p className="mt-2 text-[11px] leading-snug text-white/40">
          Sun follows the time-of-day slider, your location, and building orientation.
        </p>
      ) : (
        <>
          <MiniSlider label="Direction" min={0} max={360} step={1} value={az} suffix="°" onChange={(v) => setSunAngles(v, el)} />
          <MiniSlider label="Height" min={0} max={90} step={1} value={el} suffix="°" onChange={(v) => setSunAngles(az, v)} />
        </>
      )}

      <MiniSlider label="Intensity" min={0.2} max={2} step={0.05} value={intensity} suffix="×" onChange={setSunIntensity} />

      <label className="mt-3 flex items-center gap-2 text-xs text-white/60">
        <input type="checkbox" checked={showSun} onChange={toggleShowSun} />
        Show sun in scene
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
        <input type="checkbox" checked={showSunPath} onChange={toggleSunPath} />
        Sun path &amp; compass
      </label>

      <div className="mt-3 border-t border-white/10 pt-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Quality</div>
        <div className="flex overflow-hidden rounded-md border border-white/15">
          {(['low', 'med', 'high'] as Quality[]).map((q) => (
            <button key={q} className={seg(quality === q)} onClick={() => setQuality(q)}>
              {q === 'low' ? 'Low' : q === 'med' ? 'Med' : 'High'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
