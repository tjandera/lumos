import { X } from 'lucide-react';
import { useUiStore } from './uiStore';

const CATEGORY_LABEL: Record<string, string> = {
  sofa: 'sofa',
  armchair: 'armchair',
  bench: 'bench',
  chair: 'chair',
  coffee_table: 'coffee table',
  dining_table: 'dining table',
  side_table: 'side table',
  desk: 'desk',
  bed: 'bed',
  bookshelf: 'bookshelf',
  tv_stand: 'TV stand',
  plant: 'plant',
  rug: 'rug',
  other: 'an item',
};

/** What happened with the last photo import — which detected furniture had no good
 * match in our catalog, plus the model's own caveats. Separate from the guided
 * location/orientation callout (LightingPanel) since it's relevant immediately, before
 * the user necessarily opens that panel. */
export function ImportSummaryBanner() {
  const skipped = useUiStore((s) => s.importSkipped);
  const notes = useUiStore((s) => s.importNotes);
  const dismiss = useUiStore((s) => s.dismissImportSummary);

  if (skipped.length === 0 && !notes) return null;

  return (
    <div className="absolute left-1/2 top-3 z-10 w-full max-w-md -translate-x-1/2 rounded-xl bg-black/80 p-3 text-sm text-white shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          {skipped.length > 0 && (
            <p className="text-white/80">
              {skipped.length === 1 ? "Didn't recognize " : `Didn't recognize ${skipped.length} items: `}
              {skipped.map((c) => CATEGORY_LABEL[c] ?? c).join(', ')} — not in our furniture library, so
              {skipped.length === 1 ? ' it was' : ' they were'} skipped rather than guessed at.
            </p>
          )}
          {notes && <p className="text-white/50">{notes}</p>}
        </div>
        <button className="shrink-0 text-white/40 hover:text-white/70" onClick={dismiss}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
