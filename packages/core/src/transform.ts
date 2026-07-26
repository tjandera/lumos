import type { SceneDocument, Vec2 } from './schema';

function roomFootprintCenter(doc: SceneDocument): Vec2 {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const room of doc.rooms) {
    for (const w of room.walls) {
      xs.push(w.start.x, w.end.x);
      zs.push(w.start.z, w.end.z);
    }
  }
  if (xs.length === 0) return { x: 0, z: 0 };
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Rotates (x,z) around `center` by `deg`, using the same convention as the renderer's
 * `rotation.y` (a Three.js Y-axis rotation) — so adding the same `deg` to a furniture
 * item's `rotationY` keeps it facing the same way relative to the room after the room
 * itself has been rotated. */
function rotatePoint(p: Vec2, center: Vec2, deg: number): Vec2 {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dz = p.z - center.z;
  return { x: round(center.x + dx * cos + dz * sin), z: round(center.z - dx * sin + dz * cos) };
}

/**
 * Rigidly rotates the entire building — every wall, furniture instance, and light
 * fixture — around the room footprint's center by `deg` degrees. `site.trueNorthOffsetDeg`
 * is deliberately left untouched: it describes the fixed relationship between the
 * document's coordinate axes and true north, which doesn't change just because the room
 * has been repositioned within that frame — that's exactly what "spin the building
 * relative to a fixed compass" means.
 */
export function rotateBuilding(doc: SceneDocument, deg: number): SceneDocument {
  const normalizedDeg = ((deg % 360) + 360) % 360;
  if (normalizedDeg === 0) return doc;
  const center = roomFootprintCenter(doc);

  return {
    ...doc,
    rooms: doc.rooms.map((room) => ({
      ...room,
      walls: room.walls.map((w) => ({
        ...w,
        start: rotatePoint(w.start, center, normalizedDeg),
        end: rotatePoint(w.end, center, normalizedDeg),
      })),
    })),
    furniture: doc.furniture.map((f) => ({
      ...f,
      position: { ...f.position, ...rotatePoint(f.position, center, normalizedDeg) },
      rotationY: round((((f.rotationY + normalizedDeg) % 360) + 360) % 360),
    })),
    lights: doc.lights.map((l) => ({
      ...l,
      position: { ...l.position, ...rotatePoint(l.position, center, normalizedDeg) },
    })),
  };
}
