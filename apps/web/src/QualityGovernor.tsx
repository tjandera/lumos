import { useEffect, useRef, useState } from 'react';
import { usePerf } from './perf';
import { useUiStore, type Quality } from './uiStore';
import { evaluateQualityGovernor, initialGovernorState, type GovernorState } from './qualityAdaptation';

const LABEL: Record<Quality, string> = { low: 'Low', med: 'Medium', high: 'High' };
const TIERS: Quality[] = ['low', 'med', 'high'];

/**
 * Holds actual frame rate inside a roughly 30–60fps band by nudging the quality tier
 * (shadow-map resolution, AO sample count, contact-shadow resolution — see Scene3D.tsx
 * and Realism.tsx) up or down, instead of everyone getting the same fixed preset
 * regardless of their hardware. Pure decision logic lives in qualityAdaptation.ts; this
 * just wires it to the real fps sample (`usePerf`, updated every ~250ms by PerfProbe)
 * and the real quality setting, and surfaces a brief, dismissable notice so a change
 * in how the room looks is never silent/unexplained.
 *
 * Naturally inert outside the 3D view: PerfProbe's useFrame (and so `fps`) only ticks
 * while Scene3D's frameloop is running, which Scene3D itself already pauses in Plan
 * mode — nothing extra to gate here.
 */
export function QualityGovernor() {
  const fps = usePerf((s) => s.fps);
  const quality = useUiStore((s) => s.quality);
  const setQuality = useUiStore((s) => s.setQuality);
  const stateRef = useRef<GovernorState>(initialGovernorState);
  const [notice, setNotice] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const result = evaluateQualityGovernor(stateRef.current, fps, Date.now(), quality);
    stateRef.current = result.state;
    if (result.changeTo) {
      const direction = TIERS.indexOf(result.changeTo) > TIERS.indexOf(quality) ? 'up' : 'down';
      setQuality(result.changeTo);
      setNotice(direction);
    }
    // Deliberately fps-only: this reacts to each new fps sample, reading quality fresh
    // each time rather than re-subscribing whenever quality itself changes (which
    // would just re-run this pointlessly on every tier switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fps]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [notice]);

  if (!notice) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur">
      {notice === 'down'
        ? `Quality lowered to ${LABEL[quality]} to keep things smooth`
        : `Quality raised to ${LABEL[quality]} — plenty of headroom`}
    </div>
  );
}
