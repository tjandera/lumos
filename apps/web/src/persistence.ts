import { migrateSceneDocument, sampleScene, type SceneDocument } from '@interior/core';

const KEY = 'interior:scene:v2';
/** Older builds used this key — still try it once so a judge's earlier session isn't lost. */
const LEGACY_KEY = 'interior:scene';

/**
 * Ensure every array the renderer/UI touches is present even if a migrator or an
 * older export left a hole. `migrateSceneDocument` already zod-parses, but a defensive
 * normalize here means a single missing field can never crash RoomStatus / SceneView.
 */
function ensureArrays(doc: SceneDocument): SceneDocument {
  return {
    ...doc,
    rooms: doc.rooms ?? [],
    openings: doc.openings ?? [],
    furniture: doc.furniture ?? [],
    lights: doc.lights ?? [],
    lightingScenes: doc.lightingScenes ?? [],
  };
}

/**
 * Load the saved design, validating + migrating it to the current schema. Falls back
 * to the sample scene if nothing is saved or the saved data is unreadable — so a
 * corrupt or outdated payload can never brick the app.
 */
export function loadScene(): SceneDocument {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (raw) return ensureArrays(migrateSceneDocument(JSON.parse(raw)));
  } catch (err) {
    console.warn('[persistence] could not load saved scene; using sample', err);
  }
  return sampleScene;
}

export function saveScene(doc: SceneDocument): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
  } catch (err) {
    console.warn('[persistence] could not save scene', err);
  }
}

export function clearScene(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
