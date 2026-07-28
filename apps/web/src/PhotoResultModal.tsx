import { X } from 'lucide-react';
import { useUiStore } from './uiStore';

/**
 * A prominent, centered presentation of the last "Render photo" capture — the
 * every-setting-maxed PNG `PhotoCapture` produces (see Realism.tsx). LightingPanel
 * already surfaces the same `photoResult` inline for people who have that panel open;
 * this modal makes the result impossible to miss regardless of which panel (if any) is
 * open, which matters for a one-click "Capture" toolbar button.
 */
export function PhotoResultModal() {
  const photoResult = useUiStore((s) => s.photoResult);
  const photoRequested = useUiStore((s) => s.photoRequested);
  const clearPhotoResult = useUiStore((s) => s.clearPhotoResult);

  if (!photoResult || photoRequested) return null;

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6"
      onClick={clearPhotoResult}
    >
      <div
        className="max-h-full max-w-3xl overflow-auto rounded-xl bg-neutral-900 p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Rendered photo</span>
          <button className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white/90" onClick={clearPhotoResult}>
            <X size={16} />
          </button>
        </div>
        <img src={photoResult} alt="Rendered photo" className="max-h-[70vh] w-full rounded border border-white/10 object-contain" />
        <div className="mt-3 flex justify-end gap-2">
          <a
            href={photoResult}
            download="interior-photo.png"
            className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/30"
          >
            Download PNG
          </a>
          <button className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/20" onClick={clearPhotoResult}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
