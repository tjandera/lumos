import { useState } from 'react';
import { useUiStore } from './uiStore';

/** The photo a room was imported from, pinned so it can be compared against while
 * refining walls/openings/materials — most useful in Plan view, but left available in
 * either mode rather than tying it to one. */
export function ReferencePhotoPanel() {
  const referencePhoto = useUiStore((s) => s.referencePhoto);
  const showReferencePhoto = useUiStore((s) => s.showReferencePhoto);
  const toggleReferencePhoto = useUiStore((s) => s.toggleReferencePhoto);
  const [collapsed, setCollapsed] = useState(false);

  if (!referencePhoto || !showReferencePhoto) return null;

  return (
    <div className="absolute bottom-3 right-3 w-56 rounded-xl bg-black/70 p-2 text-white shadow-lg backdrop-blur">
      <div className="mb-1 flex items-center justify-between px-1 text-[10px] uppercase tracking-wider text-white/40">
        <span>Reference photo</span>
        <div className="flex gap-2">
          <button className="hover:text-white/70" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? '▢' : '—'}
          </button>
          <button className="hover:text-white/70" onClick={toggleReferencePhoto}>
            ✕
          </button>
        </div>
      </div>
      {!collapsed && <img src={referencePhoto} alt="Room reference" className="w-full rounded" />}
    </div>
  );
}
