import { migrateSceneDocument, sampleScene, type SceneDocument } from '@interior/core';

const KEY = 'interior:scene:v1';

/**
 * Load the saved design, validating + migrating it to the current schema. Falls back
 * to the sample scene if nothing is saved or the saved data is unreadable — so a
 * corrupt or outdated payload can never brick the app.
 */
export function loadScene(): SceneDocument {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrateSceneDocument(JSON.parse(raw));
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
