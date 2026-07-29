import { useMemo, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { documentDaylightAperture } from '@interior/core';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';

/**
 * Explains a dark room instead of leaving the user staring at a black frame.
 *
 * Now that daylight is gated on a room's actual openings (see `daylightAperture` in
 * core, applied in Scene3D), a sealed box with no lamps renders correctly — and
 * correctly means nearly black. That is right, and it is also exactly what a broken
 * renderer looks like, so the one case worth narrating is the structural one: no way
 * for light to get in, and nothing switched on inside.
 *
 * Deliberately not shown for a dark *night* scene with windows — the user moved the
 * time slider there on purpose and doesn't need to be told the sun has set.
 */
export function DarkRoomNotice() {
  const doc = useSceneStore((s) => s.doc);
  const mode = useUiStore((s) => s.mode);
  const toggleLighting = useUiStore((s) => s.toggleLighting);
  const lightingOpen = useUiStore((s) => s.lightingOpen);
  const [dismissed, setDismissed] = useState(false);

  const aperture = useMemo(
    () => documentDaylightAperture(doc.rooms, doc.openings ?? []),
    [doc.rooms, doc.openings],
  );
  const anyLampOn = useMemo(() => (doc.lights ?? []).some((l) => l.on || l.auto), [doc.lights]);

  const reason = aperture.sealed
    ? 'no windows or doors'
    : aperture.covered
      ? 'the blinds are closed'
      : null;

  // Only speak up when the scene is genuinely unlit: no daylight route in, nothing on.
  if (dismissed || mode !== '3d' || !reason || anyLampOn) return null;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-10 flex max-w-sm -translate-x-1/2 items-start gap-2 rounded-lg bg-black/75 px-3 py-2 text-xs text-white shadow-lg backdrop-blur">
      <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-300" />
      <div>
        <p className="leading-snug">
          This room is dark because it has {reason} and no lights switched on.
        </p>
        <div className="mt-1 flex gap-2">
          {!lightingOpen && (
            <button className="text-amber-200 underline hover:no-underline" onClick={toggleLighting}>
              Add a light
            </button>
          )}
          <span className="text-white/35">
            {aperture.sealed ? 'or add a window in Plan' : 'or open the blinds in Plan'}
          </span>
        </div>
      </div>
      <button
        className="ml-1 shrink-0 rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white/80"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
