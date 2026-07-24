import { usePerf } from './perf';

// Phase-0 perf budget. Enforced from Phase 1 onward; surfaced now so regressions
// are visible early instead of discovered in a Phase-5 "perf pass".
const BUDGET = { fps: 60, calls: 150, triangles: 500_000 };

export function PerfHud() {
  const fps = usePerf((s) => s.fps);
  const frameMs = usePerf((s) => s.frameMs);
  const calls = usePerf((s) => s.calls);
  const triangles = usePerf((s) => s.triangles);

  const ok = 'text-emerald-400';
  const warn = 'text-amber-400';

  return (
    <div className="pointer-events-none absolute right-3 top-3 rounded-xl bg-black/60 px-3 py-2 font-mono text-xs text-white shadow-lg backdrop-blur">
      <div className="mb-1 font-sans text-[10px] uppercase tracking-widest text-white/40">
        Perf budget
      </div>
      <Row label="FPS" value={String(fps)} cls={fps > 0 && fps < BUDGET.fps ? warn : ok} />
      <Row label="Frame" value={`${frameMs} ms`} cls="text-white/80" />
      <Row label="Draw calls" value={String(calls)} cls={calls > BUDGET.calls ? warn : ok} />
      <Row
        label="Triangles"
        value={triangles.toLocaleString()}
        cls={triangles > BUDGET.triangles ? warn : ok}
      />
    </div>
  );
}

function Row({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <div className="flex justify-between gap-8">
      <span className="text-white/50">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}
