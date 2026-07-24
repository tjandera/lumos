import { catalog } from '@interior/catalog';
import type { SceneDocument } from '@interior/core';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';

/** Center of the room footprint — where newly added furniture drops in. */
function roomCenter(doc: SceneDocument): { x: number; z: number } {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const room of doc.rooms) {
    for (const w of room.walls) {
      xs.push(w.start.x, w.end.x);
      zs.push(w.start.z, w.end.z);
    }
  }
  if (xs.length === 0) return { x: 0, z: 0 };
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
}

export function CatalogPanel() {
  const doc = useSceneStore((s) => s.doc);
  const edit = useSceneStore((s) => s.edit);
  const selectFurniture = useUiStore((s) => s.selectFurniture);

  const add = (catalogId: string) => {
    const id = crypto.randomUUID();
    const c = roomCenter(doc);
    edit((d) => {
      d.furniture.push({ id, catalogId, position: { x: c.x, y: 0, z: c.z }, rotationY: 0, scale: 1 });
    });
    selectFurniture(id);
  };

  return (
    <div className="absolute bottom-3 left-3 max-w-[16rem] rounded-xl bg-black/60 p-2 text-white shadow-lg backdrop-blur">
      <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-white/40">Add furniture</div>
      <div className="flex flex-wrap gap-1">
        {catalog.map((c) => (
          <button
            key={c.id}
            onClick={() => add(c.id)}
            className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
            title={`${c.width} × ${c.depth} m`}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
