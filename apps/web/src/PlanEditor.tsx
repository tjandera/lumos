import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { SceneDocument, Wall, Opening, Covering } from '@interior/core';
import { getCatalogItem, DEFAULT_ITEM } from '@interior/catalog';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';
import { useCollidingFurniture } from './collisions';

const GRID = 0.1; // snap resolution (meters)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Tool = 'select' | 'wall';
type Selection = { type: 'wall' | 'opening'; id: string } | null;
type Drag =
  | { kind: 'endpoint'; wallId: string; which: 'start' | 'end'; x: number; z: number }
  | { kind: 'opening'; openingId: string; offset: number }
  | { kind: 'furniture'; id: string; x: number; z: number }
  | null;

function wallLength(w: Wall): number {
  return Math.hypot(w.end.x - w.start.x, w.end.z - w.start.z);
}
function findWall(doc: SceneDocument, id: string): Wall | undefined {
  for (const room of doc.rooms) {
    const w = room.walls.find((x) => x.id === id);
    if (w) return w;
  }
  return undefined;
}
/** Distance (meters) of point p projected onto the wall, from wall.start. */
function projectOffset(w: Wall, p: { x: number; z: number }): number {
  const ex = w.end.x - w.start.x;
  const ez = w.end.z - w.start.z;
  const len = Math.hypot(ex, ez) || 1;
  return ((p.x - w.start.x) * ex + (p.z - w.start.z) * ez) / len;
}
function pointAlong(w: Wall, dist: number): { x: number; z: number } {
  const ex = w.end.x - w.start.x;
  const ez = w.end.z - w.start.z;
  const len = Math.hypot(ex, ez) || 1;
  return { x: w.start.x + (ex / len) * dist, z: w.start.z + (ez / len) * dist };
}

export function PlanEditor() {
  const doc = useSceneStore((s) => s.doc);
  const edit = useSceneStore((s) => s.edit);
  const selectedFurnitureId = useUiStore((s) => s.selectedFurnitureId);
  const selectFurniture = useUiStore((s) => s.selectFurniture);
  const collidingIds = useCollidingFurniture(doc);

  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [snap, setSnap] = useState(true);
  const [sel, setSel] = useState<Selection>(null); // wall / opening (furniture lives in uiStore)
  const [drag, setDrag] = useState<Drag>(null);
  const [pending, setPending] = useState<{ x: number; z: number } | null>(null);

  const snapVal = (v: number) => (snap ? Math.round(v / GRID) * GRID : Math.round(v * 1000) / 1000);
  const bounds = planBounds(doc);

  const toWorld = (clientX: number, clientY: number): { x: number; z: number } | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, z: p.y };
  };

  // Selecting one kind clears the other so only one properties panel shows.
  const selectWallOrOpening = (s: Selection) => {
    setSel(s);
    selectFurniture(null);
  };
  const selectFurn = (id: string) => {
    selectFurniture(id);
    setSel(null);
  };

  // ---- live drag overrides (rendered before the single commit on pointer-up) ----
  const effEndpoints = (w: Wall) => {
    if (drag?.kind === 'endpoint' && drag.wallId === w.id) {
      const p = { x: drag.x, z: drag.z };
      return drag.which === 'start' ? { start: p, end: w.end } : { start: w.start, end: p };
    }
    return { start: w.start, end: w.end };
  };
  const effOffset = (o: Opening) =>
    drag?.kind === 'opening' && drag.openingId === o.id ? drag.offset : o.offset;
  const effFurniturePos = (id: string, pos: { x: number; z: number }) =>
    drag?.kind === 'furniture' && drag.id === id ? { x: drag.x, z: drag.z } : pos;

  // ---- pointer handling ----
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    const p = toWorld(e.clientX, e.clientY);
    if (!p) return;
    if (drag.kind === 'endpoint' || drag.kind === 'furniture') {
      setDrag({ ...drag, x: snapVal(p.x), z: snapVal(p.z) });
    } else {
      const o = doc.openings.find((x) => x.id === drag.openingId);
      const w = o ? findWall(doc, o.wallId) : undefined;
      if (w && o) setDrag({ ...drag, offset: clamp(snapVal(projectOffset(w, p)), 0, wallLength(w) - o.width) });
    }
  };

  const commitDrag = () => {
    if (!drag) return;
    if (drag.kind === 'endpoint') {
      const { wallId, which, x, z } = drag;
      edit((d) => {
        const w = findWall(d, wallId);
        if (w) w[which] = { x, z };
      });
    } else if (drag.kind === 'furniture') {
      const { id, x, z } = drag;
      edit((d) => {
        const f = d.furniture.find((x2) => x2.id === id);
        if (f) f.position = { x, y: f.position.y, z };
      });
    } else {
      const { openingId, offset } = drag;
      edit((d) => {
        const o = d.openings.find((x) => x.id === openingId);
        if (o) o.offset = offset;
      });
    }
    setDrag(null);
  };

  const onBackgroundPointerDown = (e: PointerEvent) => {
    if (tool !== 'wall') {
      setSel(null);
      selectFurniture(null);
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    if (!p) return;
    const snapped = { x: snapVal(p.x), z: snapVal(p.z) };
    if (!pending) {
      setPending(snapped);
    } else {
      edit((d) => {
        const room = d.rooms[0];
        if (room) {
          room.walls.push({ id: crypto.randomUUID(), start: pending, end: snapped, thickness: 0.12, height: 2.7 });
        }
      });
      setPending(null);
    }
  };

  const startEndpointDrag = (e: PointerEvent, w: Wall, which: 'start' | 'end') => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    selectWallOrOpening({ type: 'wall', id: w.id });
    const pt = which === 'start' ? w.start : w.end;
    setDrag({ kind: 'endpoint', wallId: w.id, which, x: pt.x, z: pt.z });
  };
  const startOpeningDrag = (e: PointerEvent, o: Opening) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    selectWallOrOpening({ type: 'opening', id: o.id });
    setDrag({ kind: 'opening', openingId: o.id, offset: o.offset });
  };
  const startFurnitureDrag = (e: PointerEvent, id: string, pos: { x: number; z: number }) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    selectFurn(id);
    setDrag({ kind: 'furniture', id, x: pos.x, z: pos.z });
  };

  // ---- document mutations from the panel ----
  const addOpening = (wallId: string, kind: Opening['kind']) =>
    edit((d) => {
      const w = findWall(d, wallId);
      if (!w) return;
      const width = kind === 'door' ? 0.9 : 1.2;
      d.openings.push({
        id: crypto.randomUUID(),
        wallId,
        kind,
        offset: Math.max(0, wallLength(w) / 2 - width / 2),
        width,
        height: kind === 'door' ? 2.1 : 1.2,
        sillHeight: kind === 'door' ? 0 : 0.9,
        glassTint: 0.06,
        covering: { type: 'none', state: 'open' },
      });
    });
  const deleteWall = (id: string) => {
    edit((d) => {
      for (const room of d.rooms) room.walls = room.walls.filter((w) => w.id !== id);
      d.openings = d.openings.filter((o) => o.wallId !== id);
    });
    setSel(null);
  };
  const deleteOpening = (id: string) => {
    edit((d) => {
      d.openings = d.openings.filter((o) => o.id !== id);
    });
    setSel(null);
  };
  const setWallField = (id: string, field: 'thickness' | 'height', value: number) =>
    edit((d) => {
      const w = findWall(d, id);
      if (w && Number.isFinite(value) && value > 0) w[field] = value;
    });
  const setOpeningWidth = (id: string, value: number) =>
    edit((d) => {
      const o = d.openings.find((x) => x.id === id);
      if (o && Number.isFinite(value) && value > 0) o.width = value;
    });
  const setGlassTint = (id: string, value: number) =>
    edit((d) => {
      const o = d.openings.find((x) => x.id === id);
      if (o) o.glassTint = value;
    });
  const setCovering = (id: string, covering: Partial<Covering>) =>
    edit((d) => {
      const o = d.openings.find((x) => x.id === id);
      if (o) Object.assign(o.covering, covering);
    });
  const rotateFurniture = (id: string, delta: number) =>
    edit((d) => {
      const f = d.furniture.find((x) => x.id === id);
      if (f) f.rotationY = ((f.rotationY + delta) % 360 + 360) % 360;
    });
  const deleteFurniture = (id: string) => {
    edit((d) => {
      d.furniture = d.furniture.filter((f) => f.id !== id);
    });
    selectFurniture(null);
  };

  const gridLines = buildGrid(bounds);

  const panel = renderPanel();

  function renderPanel(): ReactNode {
    if (selectedFurnitureId) {
      const f = doc.furniture.find((x) => x.id === selectedFurnitureId);
      if (!f) return null;
      const cat = getCatalogItem(f.catalogId) ?? DEFAULT_ITEM;
      return (
        <Panel title={cat.name}>
          <Field label="Footprint">
            {cat.width} × {cat.depth} m
          </Field>
          <Field label="Rotation">{Math.round(f.rotationY)}°</Field>
          <div className="mt-2 flex gap-2">
            <button className={btn} onClick={() => rotateFurniture(f.id, -15)}>
              ⟲ 15°
            </button>
            <button className={btn} onClick={() => rotateFurniture(f.id, 15)}>
              ⟳ 15°
            </button>
          </div>
          {collidingIds.has(f.id) && <div className="mt-2 text-[11px] text-red-300">Overlapping another item</div>}
          <button
            className={`${btn} mt-2 w-full !bg-red-500/20 !text-red-200`}
            onClick={() => deleteFurniture(f.id)}
          >
            Delete
          </button>
        </Panel>
      );
    }
    if (sel?.type === 'wall') {
      const w = findWall(doc, sel.id);
      if (!w) return null;
      return (
        <Panel title="Wall">
          <Field label="Length">{wallLength(w).toFixed(2)} m</Field>
          <NumberField label="Thickness" value={w.thickness} step={0.01} onChange={(v) => setWallField(w.id, 'thickness', v)} />
          <NumberField label="Height" value={w.height} step={0.1} onChange={(v) => setWallField(w.id, 'height', v)} />
          <div className="mt-2 flex gap-2">
            <button className={btn} onClick={() => addOpening(w.id, 'window')}>
              + Window
            </button>
            <button className={btn} onClick={() => addOpening(w.id, 'door')}>
              + Door
            </button>
          </div>
          <button className={`${btn} mt-2 w-full !bg-red-500/20 !text-red-200`} onClick={() => deleteWall(w.id)}>
            Delete wall
          </button>
        </Panel>
      );
    }
    if (sel?.type === 'opening') {
      const o = doc.openings.find((x) => x.id === sel.id);
      if (!o) return null;
      return (
        <Panel title={o.kind === 'door' ? 'Door' : 'Window'}>
          <Field label="Offset">{o.offset.toFixed(2)} m</Field>
          <NumberField label="Width" value={o.width} step={0.05} onChange={(v) => setOpeningWidth(o.id, v)} />
          {o.kind === 'window' && (
            <>
              <label className="mt-2 block text-sm">
                <div className="mb-0.5 flex justify-between text-white/50">
                  <span>Glass tint</span>
                  <span className="font-mono text-white/70">{Math.round(o.glassTint * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={o.glassTint}
                  onChange={(e) => setGlassTint(o.id, Number(e.target.value))}
                  className="h-1 w-full cursor-pointer accent-sky-400"
                />
              </label>
              <div className="mt-2 text-sm text-white/50">Covering</div>
              <div className="mt-1 flex gap-1">
                {(['none', 'curtains', 'blinds'] as Covering['type'][]).map((t) => (
                  <button
                    key={t}
                    className={`rounded px-2 py-0.5 text-[11px] ${
                      o.covering.type === t ? 'bg-sky-500/25 text-sky-200' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                    onClick={() => setCovering(o.id, { type: t })}
                  >
                    {t === 'none' ? 'None' : t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              {o.covering.type !== 'none' && (
                <label className="mt-2 flex items-center gap-2 text-sm text-white/60">
                  <input
                    type="checkbox"
                    checked={o.covering.state === 'closed'}
                    onChange={(e) => setCovering(o.id, { state: e.target.checked ? 'closed' : 'open' })}
                  />
                  Closed (blocks daylight)
                </label>
              )}
            </>
          )}
          <button className={`${btn} mt-2 w-full !bg-red-500/20 !text-red-200`} onClick={() => deleteOpening(o.id)}>
            Delete {o.kind}
          </button>
        </Panel>
      );
    }
    return null;
  }

  return (
    <div className="absolute inset-0 bg-neutral-950">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        viewBox={`${bounds.minX} ${bounds.minZ} ${bounds.w} ${bounds.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={commitDrag}
        onPointerLeave={commitDrag}
      >
        {gridLines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#26262b" strokeWidth={0.012} />
        ))}

        {/* walls */}
        {doc.rooms.flatMap((room) =>
          room.walls.map((w) => {
            const { start, end } = effEndpoints(w);
            const selected = sel?.type === 'wall' && sel.id === w.id;
            return (
              <g key={w.id}>
                <line
                  x1={start.x}
                  y1={start.z}
                  x2={end.x}
                  y2={end.z}
                  stroke="transparent"
                  strokeWidth={Math.max(w.thickness, 0.35)}
                  strokeLinecap="round"
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (tool === 'select') selectWallOrOpening({ type: 'wall', id: w.id });
                  }}
                />
                <line
                  x1={start.x}
                  y1={start.z}
                  x2={end.x}
                  y2={end.z}
                  stroke={selected ? '#38bdf8' : '#cbd2dc'}
                  strokeWidth={w.thickness}
                  strokeLinecap="butt"
                  pointerEvents="none"
                />
              </g>
            );
          }),
        )}

        {/* furniture footprints */}
        {doc.furniture.map((f) => {
          const cat = getCatalogItem(f.catalogId) ?? DEFAULT_ITEM;
          const pos = effFurniturePos(f.id, f.position);
          const w = cat.width * f.scale;
          const d = cat.depth * f.scale;
          const colliding = collidingIds.has(f.id);
          const selected = f.id === selectedFurnitureId;
          return (
            <g
              key={f.id}
              transform={`translate(${pos.x} ${pos.z}) rotate(${-f.rotationY})`}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => startFurnitureDrag(e, f.id, f.position)}
            >
              <rect
                x={-w / 2}
                y={-d / 2}
                width={w}
                height={d}
                fill={colliding ? 'rgba(239,68,68,0.28)' : 'rgba(255,255,255,0.10)'}
                stroke={colliding ? '#ef4444' : selected ? '#38bdf8' : '#aeb6c2'}
                strokeWidth={selected ? 0.05 : 0.03}
              />
              <text x={0} y={0} fontSize={0.22} fill="#e5e7eb" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                {cat.name}
              </text>
            </g>
          );
        })}

        {/* openings */}
        {doc.openings.map((o) => {
          const w = findWall(doc, o.wallId);
          if (!w) return null;
          const eff = effEndpoints(w);
          const wall: Wall = { ...w, start: eff.start, end: eff.end };
          const off = effOffset(o);
          const a = pointAlong(wall, off);
          const b = pointAlong(wall, off + o.width);
          const selected = sel?.type === 'opening' && sel.id === o.id;
          return (
            <line
              key={o.id}
              x1={a.x}
              y1={a.z}
              x2={b.x}
              y2={b.z}
              stroke={o.kind === 'door' ? '#f59e0b' : '#22d3ee'}
              strokeWidth={w.thickness * 1.9}
              strokeLinecap="butt"
              opacity={selected ? 1 : 0.85}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => startOpeningDrag(e, o)}
            />
          );
        })}

        {/* endpoint handles */}
        {doc.rooms.flatMap((room) =>
          room.walls.flatMap((w) => {
            const { start, end } = effEndpoints(w);
            return (['start', 'end'] as const).map((which) => {
              const p = which === 'start' ? start : end;
              return (
                <circle
                  key={`${w.id}-${which}`}
                  cx={p.x}
                  cy={p.z}
                  r={0.11}
                  fill="#0b0b0e"
                  stroke="#38bdf8"
                  strokeWidth={0.03}
                  style={{ cursor: 'grab' }}
                  onPointerDown={(e) => startEndpointDrag(e, w, which)}
                />
              );
            });
          }),
        )}

        {/* dimension labels */}
        {doc.rooms.flatMap((room) =>
          room.walls.map((w) => {
            const { start, end } = effEndpoints(w);
            return (
              <text
                key={`dim-${w.id}`}
                x={(start.x + end.x) / 2}
                y={(start.z + end.z) / 2}
                fontSize={0.26}
                fill="#8b94a3"
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {wallLength(w).toFixed(2)} m
              </text>
            );
          }),
        )}

        {pending && (
          <circle cx={pending.x} cy={pending.z} r={0.14} fill="none" stroke="#34d399" strokeWidth={0.04} />
        )}
      </svg>

      <PlanTools
        tool={tool}
        setTool={setTool}
        snap={snap}
        setSnap={setSnap}
        pending={!!pending}
        cancelPending={() => setPending(null)}
      />

      {panel}

      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-3 py-1.5 text-center text-[11px] text-white/60 backdrop-blur">
        Drag endpoints to reshape · drag furniture to move · click to select · edits are undoable
      </div>
    </div>
  );
}

function PlanTools({
  tool,
  setTool,
  snap,
  setSnap,
  pending,
  cancelPending,
}: {
  tool: Tool;
  setTool: (t: Tool) => void;
  snap: boolean;
  setSnap: (v: boolean) => void;
  pending: boolean;
  cancelPending: () => void;
}) {
  const seg = (active: boolean) =>
    `px-2.5 py-1 text-xs ${active ? 'bg-sky-500/25 text-sky-200' : 'text-white/60 hover:bg-white/10'}`;
  return (
    <div className="absolute left-3 top-16 flex items-center gap-2 rounded-xl bg-black/60 px-2 py-1.5 text-white shadow-lg backdrop-blur">
      <div className="flex overflow-hidden rounded-md border border-white/15">
        <button className={seg(tool === 'select')} onClick={() => setTool('select')}>
          Select
        </button>
        <button className={seg(tool === 'wall')} onClick={() => setTool('wall')}>
          Add wall
        </button>
      </div>
      {tool === 'wall' && (
        <span className="text-[11px] text-white/50">
          {pending ? 'click the wall end' : 'click the wall start'}
          {pending && (
            <button className="ml-2 rounded bg-white/10 px-1.5 py-0.5 hover:bg-white/20" onClick={cancelPending}>
              cancel
            </button>
          )}
        </span>
      )}
      <label className="ml-1 flex items-center gap-1 text-[11px] text-white/60">
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
        snap 0.1m
      </label>
    </div>
  );
}

const btn = 'rounded-md bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20';

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="absolute right-3 top-16 w-52 rounded-xl bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-white/50">{label}</span>
      <span className="font-mono">{children}</span>
    </div>
  );
}
function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between py-1 text-sm">
      <span className="text-white/50">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={0.01}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-20 rounded bg-white/10 px-2 py-1 text-right font-mono text-xs outline-none focus:bg-white/20"
      />
    </label>
  );
}

function planBounds(doc: SceneDocument) {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const room of doc.rooms) {
    for (const w of room.walls) {
      xs.push(w.start.x, w.end.x);
      zs.push(w.start.z, w.end.z);
    }
  }
  if (xs.length === 0) return { minX: -3, minZ: -3, w: 6, h: 6 };
  const pad = 1.2;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minZ = Math.min(...zs) - pad;
  const maxZ = Math.max(...zs) + pad;
  return { minX, minZ, w: maxX - minX, h: maxZ - minZ };
}

function buildGrid(b: { minX: number; minZ: number; w: number; h: number }) {
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let x = Math.ceil(b.minX); x <= b.minX + b.w; x += 1) {
    lines.push({ x1: x, y1: b.minZ, x2: x, y2: b.minZ + b.h });
  }
  for (let z = Math.ceil(b.minZ); z <= b.minZ + b.h; z += 1) {
    lines.push({ x1: b.minX, y1: z, x2: b.minX + b.w, y2: z });
  }
  return lines;
}
