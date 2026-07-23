import { CURRENT_SCHEMA_VERSION, type FurnitureItem, type SceneDocument, type Vector3 } from "./types.js";
import { DEFAULT_SITE } from "./migrate.js";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Create a new, empty scene document with no rooms, furniture, or lights.
 *
 * Emits a current-version (v2) document: `schemaVersion` is set and a default
 * `site` (London; no north offset — matching the default sun light's location)
 * is included so freshly created documents already satisfy the zod schema.
 */
export function createEmptyDocument(name = "Untitled design", id: string = crypto.randomUUID()): SceneDocument {
  const timestamp = nowIso();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    site: { ...DEFAULT_SITE },
    meta: {
      id,
      name,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    rooms: [],
    furniture: [],
    lights: []
  };
}

/**
 * Return a new document with the given furniture item appended. Throws if
 * an item with the same id already exists.
 */
export function addFurniture(doc: SceneDocument, item: FurnitureItem): SceneDocument {
  if (doc.furniture.some((existing) => existing.id === item.id)) {
    throw new Error(`Furniture item with id "${item.id}" already exists`);
  }

  return {
    ...doc,
    furniture: [...doc.furniture, item],
    meta: { ...doc.meta, updatedAt: nowIso() }
  };
}

/**
 * Return a new document with the given furniture item moved to a new
 * position and/or rotation. Throws if no item with that id exists.
 */
export function moveFurniture(
  doc: SceneDocument,
  itemId: string,
  updates: { position?: Vector3; rotationY?: number }
): SceneDocument {
  const index = doc.furniture.findIndex((item) => item.id === itemId);
  if (index === -1) {
    throw new Error(`Furniture item with id "${itemId}" not found`);
  }

  const existing = doc.furniture[index] as FurnitureItem;
  const updated: FurnitureItem = {
    ...existing,
    position: updates.position ?? existing.position,
    rotationY: updates.rotationY ?? existing.rotationY
  };

  const furniture = [...doc.furniture];
  furniture[index] = updated;

  return {
    ...doc,
    furniture,
    meta: { ...doc.meta, updatedAt: nowIso() }
  };
}

/**
 * Return a new document with the furniture item of the given id removed.
 * Throws if no such item exists.
 */
export function removeFurniture(doc: SceneDocument, itemId: string): SceneDocument {
  if (!doc.furniture.some((item) => item.id === itemId)) {
    throw new Error(`Furniture item with id "${itemId}" not found`);
  }

  return {
    ...doc,
    furniture: doc.furniture.filter((item) => item.id !== itemId),
    meta: { ...doc.meta, updatedAt: nowIso() }
  };
}
