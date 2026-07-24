import { suggestLayout, type SceneDocument } from '@interior/core';
import { getCatalogItem } from '@interior/catalog';
import { useSceneStore } from './store';

function interiorBounds(doc: SceneDocument) {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const room of doc.rooms) {
    for (const w of room.walls) {
      xs.push(w.start.x, w.end.x);
      zs.push(w.start.z, w.end.z);
    }
  }
  if (xs.length === 0) return { minX: -2.5, maxX: 2.5, minZ: -2, maxZ: 2 };
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

export function AIPanel() {
  const doc = useSceneStore((s) => s.doc);
  const edit = useSceneStore((s) => s.edit);
  const hasKey = Boolean(import.meta.env.VITE_AI_API_KEY);
  const count = doc.furniture.length;

  // The "intent → deterministic placement → validated" flow. Applied as one undoable edit.
  const suggest = () => {
    const bounds = interiorBounds(doc);
    const items = doc.furniture.map((f) => {
      const cat = getCatalogItem(f.catalogId);
      return { id: f.id, width: (cat?.width ?? 0.6) * f.scale, depth: (cat?.depth ?? 0.6) * f.scale };
    });
    const placements = suggestLayout(bounds, items);
    edit((d) => {
      for (const p of placements) {
        const f = d.furniture.find((x) => x.id === p.id);
        if (f) {
          f.position = { x: p.x, y: f.position.y, z: p.z };
          f.rotationY = p.rotationY;
        }
      }
    });
  };

  return (
    <div className="absolute bottom-3 right-3 w-64 rounded-xl bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">AI assistant</div>
      <button
        className="w-full rounded-md bg-emerald-500/20 px-2 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40"
        onClick={suggest}
        disabled={count === 0}
      >
        Suggest a layout{count > 0 ? ` (${count})` : ''}
      </button>
      <p className="mt-2 text-[11px] leading-snug text-white/40">
        Placement is deterministic and clearance-validated — the model only proposes intent.
      </p>
      <div className="mt-2 border-t border-white/10 pt-2">
        <input
          disabled={!hasKey}
          placeholder={hasKey ? 'Ask to rearrange…' : 'NL commands need an API key'}
          className="w-full rounded bg-white/10 px-2 py-1 text-xs placeholder:text-white/30 disabled:opacity-50"
        />
        {!hasKey && (
          <p className="mt-1 text-[10px] leading-snug text-white/30">
            Set <code className="text-white/40">VITE_AI_API_KEY</code> + a backend proxy to enable
            natural-language commands.
          </p>
        )}
      </div>
    </div>
  );
}
