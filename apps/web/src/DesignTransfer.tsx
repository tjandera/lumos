import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { migrateSceneDocument } from '@interior/core';
import { useSceneStore } from './store';

const btn = 'rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20 inline-flex items-center gap-1';

/**
 * Move a design in/out of the browser as plain JSON — handy for judges/demos (share a
 * file instead of a URL) and as a manual backup independent of localStorage. Import
 * runs the file through the same `migrateSceneDocument` the app uses on load, so an
 * older export still opens cleanly; a bad file surfaces an inline error instead of
 * silently doing nothing or corrupting the current design.
 */
export function DesignTransfer() {
  const doc = useSceneStore((s) => s.doc);
  const importDocument = useSceneStore((s) => s.importDocument);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = doc.meta.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'design';
    a.download = `${slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = migrateSceneDocument(JSON.parse(text));
      importDocument(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file as a design.');
    }
  };

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <button className={btn} onClick={exportJson} title="Download this design as a JSON file">
        <Download size={13} /> Export
      </button>
      <button className={btn} onClick={() => inputRef.current?.click()} title="Load a design from a JSON file">
        <Upload size={13} /> Import
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      {error && (
        <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md bg-red-950/90 px-2 py-1.5 text-[11px] text-red-200 shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
