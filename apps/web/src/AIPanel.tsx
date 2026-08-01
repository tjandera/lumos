import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { suggestLayout, type SceneDocument } from '@interior/core';
import { getCatalogItem, catalog as furnitureCatalog } from '@interior/catalog';
import { planLayout, solve, type CatalogItem as AiCatalogItem } from '@interior/ai';
import { useSceneStore } from './store';
import { findFreePlacement } from './placement';
import { collidingFurnitureIds, COLLISION_IGNORED_CATALOG_IDS } from './collisionUi';

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

/**
 * Bridges our furniture catalog (`@interior/catalog`, categories seating/tables/
 * storage/beds/lighting/decor) into `@interior/ai`'s shopping-list shape — the
 * categories `planLayout`'s default living-room set looks for ("sofa", "table",
 * "armchair", "lighting"), plus a demo price (this catalog has none; the AI layer's
 * budget math needs *some* number, so these are reasonable placeholders, not real
 * pricing). Only items relevant to a living-room set are mapped; anything else is
 * simply invisible to the planner, which is fine — it only ever picks from what's here.
 */
const AI_ROLE_BY_CATALOG_ID: Record<string, { category: string; price: number; nameHint?: string }> = {
  'sofa-2seat': { category: 'sofa', price: 899 },
  'sofa-3seat': { category: 'sofa', price: 1199 },
  'coffee-table': { category: 'table', price: 249, nameHint: 'coffee' },
  armchair: { category: 'armchair', price: 399 },
  'lounge-chair': { category: 'armchair', price: 449 },
  'floor-lamp': { category: 'lighting', price: 89 },
};

function bridgeCatalogForAi(): AiCatalogItem[] {
  const items: AiCatalogItem[] = [];
  for (const item of furnitureCatalog) {
    const role = AI_ROLE_BY_CATALOG_ID[item.id];
    if (!role) continue;
    items.push({
      id: item.id,
      name: item.name,
      category: role.category,
      dimensions: { w: item.width, d: item.depth, h: item.height },
      price: role.price,
      color: item.color,
      description: item.name,
    });
  }
  return items;
}

function footprintOf(catalogId: string, scale: number) {
  const cat = getCatalogItem(catalogId);
  return {
    width: (cat?.width ?? 0.6) * scale,
    depth: (cat?.depth ?? 0.6) * scale,
  };
}

/** Park colliding pieces and spiral them into free cells so Suggest layout never leaves the red "overlapping" badge. */
function repairOverlaps(d: SceneDocument) {
  for (let pass = 0; pass < 6; pass++) {
    const hits = collidingFurnitureIds(d);
    if (hits.size === 0) return;
    for (const id of hits) {
      const f = d.furniture.find((x) => x.id === id);
      if (!f || COLLISION_IGNORED_CATALOG_IDS.has(f.catalogId)) continue;
      const { width, depth } = footprintOf(f.catalogId, f.scale ?? 1);
      // Move out of the room first so the spiral search doesn't treat the old pose as occupied.
      f.position = { x: 80 + pass, y: f.position.y, z: 80 + pass };
      const spot = findFreePlacement(d, width, depth, f.id);
      f.position = { x: spot.x, y: f.position.y, z: spot.z };
      f.rotationY = spot.rotationY;
    }
  }
}

export function AIPanel() {
  const doc = useSceneStore((s) => s.doc);
  const edit = useSceneStore((s) => s.edit);
  const hasKey = Boolean(import.meta.env.VITE_AI_API_KEY);
  const count = doc.furniture?.length ?? 0;
  const [cozyMessage, setCozyMessage] = useState<string | null>(null);

  // The "intent → deterministic placement → validated" flow. Applied as one undoable edit.
  const suggest = () => {
    const bounds = interiorBounds(doc);
    const items = doc.furniture.map((f) => {
      const cat = getCatalogItem(f.catalogId);
      return {
        id: f.id,
        width: (cat?.width ?? 0.6) * f.scale,
        depth: (cat?.depth ?? 0.6) * f.scale,
        category: cat?.category,
        catalogId: f.catalogId,
      };
    });
    const placements = suggestLayout(bounds, items);
    const byId = new Map(placements.map((p) => [p.id, p]));
    edit((d) => {
      for (const f of d.furniture) {
        const p = byId.get(f.id);
        if (p) {
          f.position = { x: p.x, y: f.position.y, z: p.z };
          f.rotationY = p.rotationY;
        } else {
          // Not seated by the planner — park then repair so it doesn't sit on a new piece.
          f.position = { x: 90, y: f.position.y, z: 90 };
        }
      }
      for (const f of d.furniture) {
        if (byId.has(f.id)) continue;
        const { width, depth } = footprintOf(f.catalogId, f.scale ?? 1);
        const spot = findFreePlacement(d, width, depth, f.id);
        f.position = { x: spot.x, y: f.position.y, z: spot.z };
        f.rotationY = spot.rotationY;
      }
      repairOverlaps(d);
    });
  };

  // "Cozy living room under $3k": the LLM-shaped `planLayout` → `solve` pipeline from
  // @interior/ai, run entirely client-side against a bridged catalog. `planLayout`
  // picks a default living-room set (sofa, coffee table, armchair, lamp) within
  // budget and expresses their relationships as constraints; `solve` turns those into
  // validated, collision- and clearance-checked positions — never raw coordinates.
  const cozyLivingRoom = () => {
    const room = doc.rooms[0];
    if (!room) {
      setCozyMessage("Draw a room first (Plan tab) — there's nowhere to place furniture yet.");
      return;
    }
    const bridged = bridgeCatalogForAi();
    const { requests, items } = planLayout({ catalog: bridged, budget: 3000, generateId: () => crypto.randomUUID() });
    if (requests.length === 0) {
      setCozyMessage('No catalog items matched a living-room set within $3,000.');
      return;
    }
    const result = solve(doc, room, requests);
    if (result.placed.length > 0) {
      edit((d) => {
        for (const p of result.placed) {
          // `solve`'s `rotationY` is already in degrees (it converts from its internal
          // radians at the solver boundary) — matches FurnitureInstance.rotationY directly.
          d.furniture.push({ id: p.itemId, catalogId: p.catalogId, position: p.position, rotationY: p.rotationY, scale: 1 });
        }
      });
    }
    const total = items.reduce((sum, i) => sum + i.price, 0);
    const placedCount = result.placed.length;
    const failedCount = result.failed.length;
    setCozyMessage(
      failedCount === 0
        ? `Added ${placedCount} piece${placedCount === 1 ? '' : 's'} (~$${total.toLocaleString()}).`
        : `Added ${placedCount} of ${placedCount + failedCount} pieces (~$${total.toLocaleString()}) — ${result.failed[0]?.message ?? 'the rest did not fit.'}`,
    );
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

      <button
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-500/20 px-2 py-1.5 text-sm text-sky-200 hover:bg-sky-500/30"
        onClick={cozyLivingRoom}
      >
        <Wand2 size={13} /> Cozy living room under $3k
      </button>
      {cozyMessage && <p className="mt-1.5 text-[11px] leading-snug text-white/50">{cozyMessage}</p>}

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
