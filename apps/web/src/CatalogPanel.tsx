import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { catalog, type CatalogCategory } from '@interior/catalog';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';
import { findFreePlacement } from './placement';
import { FurnitureThumbnail } from './FurnitureThumbnail';

const CATEGORY_LABEL: Record<CatalogCategory, string> = {
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  beds: 'Beds',
  lighting: 'Lighting',
  decor: 'Decor',
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as CatalogCategory[];

/** Add-furniture drawer: search + category tabs over the shared catalog. New items land
 * in the first collision-free spot (spiraling out from the room center) rather than
 * always stacking at dead center — see `findFreePlacement`. Collapsible so it doesn't
 * permanently eat screen space once a design is furnished. */
export function CatalogPanel() {
  const doc = useSceneStore((s) => s.doc);
  const edit = useSceneStore((s) => s.edit);
  const selectFurniture = useUiStore((s) => s.selectFurniture);
  const [collapsed, setCollapsed] = useState(false);
  const [category, setCategory] = useState<CatalogCategory | 'all'>('all');
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((c) => (category === 'all' || c.category === category) && (!q || c.name.toLowerCase().includes(q)));
  }, [category, query]);

  const add = (catalogId: string) => {
    const cat = catalog.find((c) => c.id === catalogId);
    const id = crypto.randomUUID();
    const spot = findFreePlacement(doc, cat?.width ?? 0.6, cat?.depth ?? 0.6);
    edit((d) => {
      d.furniture.push({ id, catalogId, position: { x: spot.x, y: 0, z: spot.z }, rotationY: spot.rotationY, scale: 1 });
    });
    selectFurniture(id);
  };

  if (collapsed) {
    return (
      <button
        className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-2 text-xs text-white shadow-lg backdrop-blur hover:bg-black/70"
        onClick={() => setCollapsed(false)}
      >
        <ChevronUp size={13} /> Add furniture
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-3 left-3 max-w-[19rem] rounded-xl bg-black/60 p-2 text-white shadow-lg backdrop-blur"
      data-tour="catalog"
    >
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-wider text-white/40">Add furniture</span>
        <button className="text-white/40 hover:text-white/70" onClick={() => setCollapsed(true)} title="Hide">
          <ChevronDown size={13} />
        </button>
      </div>

      <div className="relative mb-1.5">
        <Search size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-md bg-white/10 py-1 pl-6 pr-2 text-xs placeholder:text-white/30 outline-none focus:bg-white/20"
        />
      </div>

      <div className="mb-1.5 flex flex-wrap gap-1">
        <button
          onClick={() => setCategory('all')}
          className={`rounded px-2 py-0.5 text-[11px] ${
            category === 'all' ? 'bg-sky-500/25 text-sky-200' : 'bg-white/10 text-white/60 hover:bg-white/20'
          }`}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded px-2 py-0.5 text-[11px] ${
              category === c ? 'bg-sky-500/25 text-sky-200' : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <div className="grid max-h-64 grid-cols-3 gap-1 overflow-y-auto">
        {items.length === 0 && <div className="col-span-3 px-1 py-2 text-xs text-white/40">No matches.</div>}
        {items.map((c) => (
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
