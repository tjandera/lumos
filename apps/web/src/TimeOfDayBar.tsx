import { useUiStore } from './uiStore';

function fmt(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Scrubs the sun across the day (transient view state — no undo/persist spam). */
export function TimeOfDayBar() {
  const timeMinutes = useUiStore((s) => s.timeMinutes);
  const setTimeMinutes = useUiStore((s) => s.setTimeMinutes);
  return (
    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-black/60 px-4 py-2 text-white shadow-lg backdrop-blur">
      <span className="text-xs text-white/50">☀ Time of day</span>
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
  );
}
