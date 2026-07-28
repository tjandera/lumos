import { RotateCcw, RotateCw, Trash2, X } from 'lucide-react';
import { getCatalogItem, DEFAULT_ITEM } from '@interior/catalog';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';
import { collidingFurnitureIds } from './collisionUi';

/**
 * A compact readout for whatever's currently selected in the 3D view — furniture (name,
 * footprint, rotation, collision state) or a light fixture (kind, height) — with quick
 * rotate/delete actions. The Plan editor already has its own always-open properties
 * panel; this is the 3D-view equivalent so you don't have to switch tabs to see what
 * you've selected or nudge its rotation.
 */
export function SelectionStatus() {
  const doc = useSceneStore((s) => s.doc);
  const edit = useSceneStore((s) => s.edit);
  const selectedFurnitureId = useUiStore((s) => s.selectedFurnitureId);
  const selectFurniture = useUiStore((s) => s.selectFurniture);
  const selectedLightId = useUiStore((s) => s.selectedLightId);
  const selectLight = useUiStore((s) => s.selectLight);

  const furniture = selectedFurnitureId ? doc.furniture.find((f) => f.id === selectedFurnitureId) : undefined;
  const light = selectedLightId ? doc.lights.find((l) => l.id === selectedLightId) : undefined;

  if (!furniture && !light) return null;

  if (furniture) {
    const cat = getCatalogItem(furniture.catalogId) ?? DEFAULT_ITEM;
    const colliding = collidingFurnitureIds(doc).has(furniture.id);
    const rotate = (delta: number) =>
      edit((d) => {
        const f = d.furniture.find((x) => x.id === furniture.id);
        if (f) f.rotationY = ((f.rotationY + delta) % 360 + 360) % 360;
      });
    const remove = () => {
      edit((d) => {
        d.furniture = d.furniture.filter((f) => f.id !== furniture.id);
      });
      selectFurniture(null);
    };
    return (
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-black/60 px-3 py-1.5 text-white shadow-lg backdrop-blur">
        <span className="text-sm font-medium">{cat.name}</span>
        <span className="font-mono text-xs text-white/50">
          {(cat.width * furniture.scale).toFixed(2)} × {(cat.depth * furniture.scale).toFixed(2)} m · {Math.round(furniture.rotationY)}°
        </span>
        {colliding && <span className="rounded bg-red-500/25 px-1.5 py-0.5 text-[10px] text-red-200">overlapping</span>}
        <button className="rounded p-1 hover:bg-white/10" title="Rotate -15°" onClick={() => rotate(-15)}>
          <RotateCcw size={13} />
        </button>
        <button className="rounded p-1 hover:bg-white/10" title="Rotate +15°" onClick={() => rotate(15)}>
          <RotateCw size={13} />
        </button>
        <button className="rounded p-1 text-red-300 hover:bg-white/10 hover:text-red-200" title="Delete" onClick={remove}>
          <Trash2 size={13} />
        </button>
        <button className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/70" title="Deselect" onClick={() => selectFurniture(null)}>
          <X size={13} />
        </button>
      </div>
    );
  }

  if (light) {
    return (
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-black/60 px-3 py-1.5 text-white shadow-lg backdrop-blur">
        <span className="text-sm font-medium capitalize">{light.kind} fixture</span>
        <span className="font-mono text-xs text-white/50">
          {Math.round(light.kelvin)}K · {light.intensityCandela} cd
        </span>
        <button className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/70" title="Deselect" onClick={() => selectLight(null)}>
          <X size={13} />
        </button>
      </div>
    );
  }

  return null;
}
