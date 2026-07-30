/**
 * IndexedDB cache for generated Image-Day frames.
 *
 * A six-moment timelapse is six billed image-model calls and several minutes of waiting.
 * Losing that to a page reload would be a bad trade, and localStorage is not an option:
 * generated PNGs run to a couple of megabytes each, well past its ~5MB total budget.
 *
 * Entries are keyed by (photo, site, date, moment) so re-generating after moving the map
 * pin or changing the date correctly misses, while reopening the panel hits.
 */

const DB_NAME = 'interior-image-day';
const STORE = 'frames';
const DB_VERSION = 1;

export interface CachedFrame {
  key: string;
  momentId: string;
  imageDataUrl: string;
  minutes: number;
  label: string;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    // Private browsing and locked-down storage partitions can make this throw or never
    // fire. The feature still works without a cache, so failure resolves to null rather
    // than rejecting and taking the panel down with it.
    if (typeof indexedDB === 'undefined') return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

/**
 * A short, stable fingerprint of the photo.
 *
 * Hashing the whole multi-megabyte data URL on every keystroke is wasteful, and a
 * collision here is harmless (worst case: a cache hit shows the wrong room, and the user
 * regenerates). Sampling the length plus a stride through the body is plenty.
 */
export function fingerprintPhoto(dataUrl: string): string {
  let h = 2166136261;
  const stride = Math.max(1, Math.floor(dataUrl.length / 4096));
  for (let i = 0; i < dataUrl.length; i += stride) {
    h ^= dataUrl.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${dataUrl.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

export interface FrameKeyParts {
  photo: string;
  lat: number;
  lng: number;
  northOffsetDeg: number;
  dateIso: string;
  momentId: string;
}

export function frameKey(p: FrameKeyParts): string {
  const at = `${p.lat.toFixed(3)},${p.lng.toFixed(3)},${Math.round(p.northOffsetDeg)}`;
  return `${fingerprintPhoto(p.photo)}|${at}|${p.dateIso}|${p.momentId}`;
}

export async function readFrame(key: string): Promise<CachedFrame | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as CachedFrame | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeFrame(frame: CachedFrame): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(frame);
      tx.oncomplete = () => resolve();
      // A quota error must not surface as a failed generation — the image is already
      // in memory and on screen.
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Every cached frame for one photo+site+date, for restoring a run on reopen. */
export async function readRun(prefix: string): Promise<CachedFrame[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const out: CachedFrame[] = [];
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(out);
        const value = cursor.value as CachedFrame;
        if (value.key.startsWith(prefix)) out.push(value);
        cursor.continue();
      };
      req.onerror = () => resolve(out);
    } catch {
      resolve([]);
    }
  });
}

export async function clearAll(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Test-only: drop the memoised connection so a fresh fake-IndexedDB can be installed. */
export function resetDbForTests(): void {
  dbPromise = null;
}
