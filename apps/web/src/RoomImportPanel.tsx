import { useEffect, useRef, useState } from 'react';
import { gps } from 'exifr';
import { analyzeRoomPhoto, checkRoomPhotoStatus } from './api';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

export function RoomImportPanel() {
  const importOpen = useUiStore((s) => s.importOpen);
  const toggleImport = useUiStore((s) => s.toggleImport);
  const importBusy = useUiStore((s) => s.importBusy);
  const importError = useUiStore((s) => s.importError);
  const startImportRequest = useUiStore((s) => s.startImportRequest);
  const importSucceeded = useUiStore((s) => s.importSucceeded);
  const importFailed = useUiStore((s) => s.importFailed);
  const setMode = useUiStore((s) => s.setMode);
  const setLightingOpen = useUiStore((s) => s.setLightingOpen);
  const setPhotoGps = useUiStore((s) => s.setPhotoGps);
  const importDocument = useSceneStore((s) => s.importDocument);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!importOpen) return;
    let cancelled = false;
    setStatus('checking');
    checkRoomPhotoStatus().then(({ available }) => {
      if (!cancelled) setStatus(available ? 'available' : 'unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, [importOpen]);

  if (!importOpen) return null;

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoGps(null); // clear any coordinates from a previously-chosen photo
    const dataUrl = await readAsDataUrl(file);
    setPreviewUrl(dataUrl);
    // Read GPS from EXIF entirely client-side — never uploaded anywhere, just offered
    // as a one-click prefill for the site location the user sets afterward.
    gps(file)
      .then((coords) => {
        if (coords) setPhotoGps({ lat: coords.latitude, lng: coords.longitude });
      })
      .catch(() => {
        // no GPS tag, or unreadable — silently fine, the location step still has manual entry
      });
  };

  const onAnalyze = async () => {
    if (!previewUrl) return;
    startImportRequest();
    try {
      const result = await analyzeRoomPhoto(previewUrl);
      importDocument(result.doc);
      setMode('3d');
      setLightingOpen(true);
      importSucceeded({ photoDataUrl: previewUrl, skipped: result.skippedFurnitureCategories, notes: result.notes });
    } catch (err) {
      importFailed(err instanceof Error ? err.message : 'Something went wrong analyzing that photo.');
    }
  };

  const close = () => {
    setPreviewUrl(null);
    toggleImport();
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-neutral-900 p-4 text-white shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold uppercase tracking-wider text-white/70">Create room from photo</div>
          <button className="text-white/40 hover:text-white/70" onClick={close}>
            ✕
          </button>
        </div>

        {status === 'checking' && <p className="text-xs text-white/50">Checking availability…</p>}

        {status === 'unavailable' && (
          <p className="rounded bg-amber-500/10 p-2 text-xs leading-snug text-amber-200">
            Photo import isn't set up yet — the server needs an OpenAI API key (see{' '}
            <code className="text-amber-100">apps/api/.env.example</code>).
          </p>
        )}

        {status === 'available' && (
          <>
            <p className="mb-2 text-xs leading-snug text-white/50">
              Upload a photo of a real room and we'll propose an approximate 3D layout — dimensions, windows,
              furniture, and materials — for you to refine. It's an estimate, not a measurement.
            </p>

            {previewUrl ? (
              <img src={previewUrl} alt="Room preview" className="mb-2 max-h-48 w-full rounded object-cover" />
            ) : (
              <button
                className="mb-2 w-full rounded-md border border-dashed border-white/20 py-6 text-xs text-white/50 hover:border-white/40 hover:text-white/70"
                onClick={() => fileInputRef.current?.click()}
              >
                Click to choose a photo
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

            {previewUrl && !importBusy && (
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-md bg-white/10 px-2 py-1.5 text-xs hover:bg-white/20"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose a different photo
                </button>
                <button
                  className="flex-1 rounded-md bg-emerald-500/20 px-2 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/30"
                  onClick={onAnalyze}
                >
                  Analyze photo
                </button>
              </div>
            )}
            {importBusy && (
              <div className="rounded-md bg-white/5 px-2 py-1.5 text-center text-xs text-white/60">
                Analyzing your photo — this can take a few seconds…
              </div>
            )}
            {importError && <p className="mt-2 text-xs leading-snug text-red-300">{importError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
