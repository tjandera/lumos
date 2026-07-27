import { Pause, Play, Sun } from 'lucide-react';
import { useUiStore } from './uiStore';

function fmt(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const PRESETS: [string, number][] = [
  ['Dawn', 6 * 60],
  ['Noon', 12 * 60],
  ['Golden', 17 * 60 + 30],
  ['Dusk', 19 * 60],
  ['Night', 22 * 60],
];

/** Scrubs the sun across the day (transient view state — no undo/persist spam), with a
 * one-click Play to sweep the full day (`SunAnimator` in Scene3D) and quick presets for
 * the lighting moments judges/users actually want to jump to. */
export function TimeOfDayBar() {
  const timeMinutes = useUiStore((s) => s.timeMinutes);
  const setTimeMinutes = useUiStore((s) => s.setTimeMinutes);
  const sunMode = useUiStore((s) => s.sunMode);
  const playing = useUiStore((s) => s.playing);
  const togglePlaying = useUiStore((s) => s.togglePlaying);

  return (
    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-xl bg-black/60 px-4 py-2 text-white shadow-lg backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1 text-xs text-white/50">
          <Sun size={12} /> Time of day
        </span>
        <button
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${
            playing ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/10 text-white/60 hover:bg-white/20'
          } ${sunMode === 'manual' ? 'opacity-30' : ''}`}
          onClick={togglePlaying}
          disabled={sunMode === 'manual'}
          title={sunMode === 'manual' ? 'Switch to Auto sun mode (Lighting panel) to play the day' : 'Sweep the sun across the day'}
        >
          {playing ? <Pause size={12} /> : <Play size={12} />}
          {playing ? 'Pause' : 'Play day'}
        </button>
        <input
          type="range"
          min={0}
          max={1439}
          step={5}
          value={timeMinutes}
          onChange={(e) => setTimeMinutes(Number(e.target.value))}
          className="h-1 w-64 cursor-pointer accent-sky-400"
        />
        <span className="w-12 font-mono text-sm tabular-nums">{fmt(timeMinutes)}</span>
      </div>
      <div className="flex gap-1">
        {PRESETS.map(([label, mins]) => (
          <button
            key={label}
            className="rounded px-2 py-0.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white/90"
            onClick={() => setTimeMinutes(mins)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
