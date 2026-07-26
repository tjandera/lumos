import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CEILING_MATERIAL,
  DEFAULT_FLOOR_MATERIAL,
  DEFAULT_WALL_MATERIAL,
  type FurnitureInstance,
  type SceneDocument,
  type Site,
  type Vec3,
} from './schema.js';

/** Default siting for a document created without one. London, no north offset. */
export const DEFAULT_SITE: Site = { lat: 51.5074, lng: -0.1278, trueNorthOffsetDeg: 0 };

export const DEFAULT_ROOM_MATERIALS = {
  wall: DEFAULT_WALL_MATERIAL,
  floor: DEFAULT_FLOOR_MATERIAL,
  ceiling: DEFAULT_CEILING_MATERIAL,
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

/** Ids only need to be unique within a document; core carries no crypto/DOM types. */
function randomId(): string {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/**
 * A new, empty design: no rooms, furniture or lights, but already valid against the
 * current schema (version, site, meta and view all populated) so it can be persisted
 * and round-tripped straight away.
 */
export function createEmptyDocument(name = 'Untitled design', id: string = randomId()): SceneDocument {
  const timestamp = nowIso();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: { id, name, createdAt: timestamp, updatedAt: timestamp },
    site: { ...DEFAULT_SITE },
    rooms: [],
    openings: [],
    furniture: [],
    lights: [],
    lightingScenes: [],
    view: {
      timeOfDay: '2026-06-21T16:00:00',
      camera: { position: { x: 5.5, y: 4.5, z: 5.5 }, target: { x: 0, y: 1, z: 0 } },
    },
  };
}

/** Stamp `meta.updatedAt`. Every mutation helper below routes through this. */
function touch(doc: SceneDocument): SceneDocument['meta'] {
  return { ...doc.meta, updatedAt: nowIso() };
}

/** Append a furniture item. Throws if the id is already taken. */
export function addFurniture(doc: SceneDocument, item: FurnitureInstance): SceneDocument {
  if (doc.furniture.some((existing) => existing.id === item.id)) {
    throw new Error(`Furniture item with id "${item.id}" already exists`);
  }
  return { ...doc, furniture: [...doc.furniture, item], meta: touch(doc) };
}

/** Move and/or rotate a furniture item. Throws if no item with that id exists. */
export function moveFurniture(
  doc: SceneDocument,
  itemId: string,
  updates: { position?: Vec3; rotationY?: number },
): SceneDocument {
  const index = doc.furniture.findIndex((item) => item.id === itemId);
  if (index === -1) throw new Error(`Furniture item with id "${itemId}" not found`);
  const current = doc.furniture[index]!;
  const next: FurnitureInstance = {
    ...current,
    position: updates.position ?? current.position,
    rotationY: updates.rotationY ?? current.rotationY,
  };
  const furniture = [...doc.furniture];
  furniture[index] = next;
  return { ...doc, furniture, meta: touch(doc) };
}

/** Remove a furniture item, and any light fixture that belonged to it. */
export function removeFurniture(doc: SceneDocument, itemId: string): SceneDocument {
  if (!doc.furniture.some((item) => item.id === itemId)) {
    throw new Error(`Furniture item with id "${itemId}" not found`);
  }
  return {
    ...doc,
    furniture: doc.furniture.filter((item) => item.id !== itemId),
    // A lamp bound to this item has nothing left to sit on.
    lights: doc.lights.filter((l) => l.furnitureItemId !== itemId),
    meta: touch(doc),
  };
}

/** Rename a design. */
export function renameDocument(doc: SceneDocument, name: string): SceneDocument {
  return { ...doc, meta: { ...touch(doc), name } };
}
