import type { Finish, Material } from '@interior/core';
import { useSceneStore } from './store';

const FINISHES: Finish[] = ['matte', 'eggshell', 'satin', 'gloss'];
const SURFACES: { key: 'wall' | 'floor' | 'ceiling'; label: string }[] = [
  { key: 'wall', label: 'Walls' },
  { key: 'floor', label: 'Floor' },
  { key: 'ceiling', label: 'Ceiling' },
];

const chip = (active: boolean) =>
  `rounded px-2 py-0.5 text-[11px] ${active ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-white/60 hover:bg-white/20'}`;

export function MaterialsPanel() {
  const doc = useSceneStore((s) => s.doc);
  const edit = useSceneStore((s) => s.edit);
  const room = doc.rooms[0];

  const setColor = (key: 'wall' | 'floor' | 'ceiling', hex: string) =>
    edit((d) => {
      const r = d.rooms[0];
      if (r) r.materials[key].color = hex;
    });
  const setFinish = (key: 'wall' | 'floor' | 'ceiling', finish: Finish) =>
    edit((d) => {
      const r = d.rooms[0];
      if (r) r.materials[key].finish = finish;
    });

  if (!room) return null;

  return (
    <div className="absolute right-3 top-16 w-64 rounded-xl bg-black/70 p-3 text-white shadow-lg backdrop-blur">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Materials</div>
      {SURFACES.map(({ key, label }) => (
        <SurfaceRow
          key={key}
          label={label}
          material={room.materials[key]}
          onColor={(hex) => setColor(key, hex)}
          onFinish={(f) => setFinish(key, f)}
        />
      ))}
      <p className="mt-2 text-[11px] leading-snug text-white/40">
        Ceiling shows when you orbit down to a low, inside-the-room angle — it fades from the
        default overhead view.
      </p>
    </div>
  );
}

function SurfaceRow({
  label,
  material,
  onColor,
  onFinish,
}: {
  label: string;
  material: Material;
  onColor: (hex: string) => void;
  onFinish: (f: Finish) => void;
}) {
  return (
    <div className="mt-2 rounded bg-white/5 p-1.5">
      <div className="flex items-center justify-between text-[11px] text-white/60">
        <span>{label}</span>
        <input
          type="color"
          value={material.color}
          onChange={(e) => onColor(e.target.value)}
          className="h-5 w-6 cursor-pointer rounded bg-transparent"
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {FINISHES.map((f) => (
          <button key={f} className={chip(material.finish === f)} onClick={() => onFinish(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
