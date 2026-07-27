import { catalog } from '@interior/catalog';
import type { SceneDocument } from '@interior/core';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';
import { FurnitureThumbnail } from './FurnitureThumbnail';

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
    <div className="absolute bottom-3 left-3 max-h-[calc(100vh-1.5rem)] max-w-[15rem] overflow-y-auto rounded-xl bg-black/60 p-2 text-white shadow-lg backdrop-blur">
      <div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-white/40">Add furniture</div>
      <div className="grid grid-cols-3 gap-1">
        {catalog.map((c) => (
          <button
            key={c.id}
            onClick={() => add(c.id)}
            className="flex flex-col items-center gap-1 rounded-md bg-white/10 px-1 py-1.5 hover:bg-white/20"
            title={`${c.name} — ${c.width} × ${c.depth} m`}
          >
            <FurnitureThumbnail catalogId={c.id} w={c.width} d={c.depth} color={c.color} />
            <span className="w-full truncate text-center text-[10px] leading-tight text-white/80">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
