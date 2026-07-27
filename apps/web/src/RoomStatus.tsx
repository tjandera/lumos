import { AlertTriangle } from 'lucide-react';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';
import { collidingFurnitureIds } from './collisionUi';
import { approxFloorAreaM2 } from './placement';

/**
 * Always-visible at-a-glance room summary: floor area, furniture/fixture counts, and a
 * loud warning if anything's currently overlapping. Sits under the perf HUD in 3D mode
 * (which only shows there) and takes its spot in Plan mode.
 */
export function RoomStatus() {
  const doc = useSceneStore((s) => s.doc);
  const mode = useUiStore((s) => s.mode);
  const area = approxFloorAreaM2(doc);
  const collisions = collidingFurnitureIds(doc).size;

  return (
    <div
      className={`pointer-events-none absolute right-3 rounded-xl bg-black/60 px-3 py-2 text-white shadow-lg backdrop-blur ${
        mode === '3d' ? 'top-24' : 'top-3'
      }`}
    >
      <div className="mb-1 font-sans text-[10px] uppercase tracking-widest text-white/40">{doc.meta.name}</div>
      <div className="flex justify-between gap-8 font-mono text-xs">
        <span className="text-white/50">Floor area</span>
        <span className="text-white/80">{area.toFixed(1)} m²</span>
      </div>
      <div className="flex justify-between gap-8 font-mono text-xs">
        <span className="text-white/50">Furniture</span>
        <span className="text-white/80">{doc.furniture?.length ?? 0}</span>
      </div>
      <div className="flex justify-between gap-8 font-mono text-xs">
        <span className="text-white/50">Fixtures</span>
        <span className="text-white/80">{doc.lights?.length ?? 0}</span>
      </div>
      {collisions > 0 && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-red-300">
          <AlertTriangle size={12} /> {collisions} overlapping
        </div>
      )}
    </div>
  );
}
