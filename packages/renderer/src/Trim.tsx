import { useMemo } from 'react';
import * as THREE from 'three';
import { wallSegment, openingSpan, type SceneDocument } from '@interior/core';

/**
 * Architectural trim: skirting boards, window sills and door architraves.
 *
 * Rooms read as CAD boxes largely because of what's *missing* at the joins — real walls
 * don't meet the floor at a bare seam, and real windows have a sill you could put a mug
 * on. All of this is generated from the walls already in the document, so it costs no
 * assets and follows any plan the user draws.
 *
 * Everything is built on the room-interior side of each wall, which is why the wall's
 * outward normal has to be resolved against the room centroid rather than assumed from
 * winding order.
 */

const SKIRTING_HEIGHT = 0.09; // m — a standard domestic skirting board
const SKIRTING_DEPTH = 0.016; // how far it stands proud of the wall face
const SILL_DEPTH = 0.05; // how far a window sill projects into the room
const SILL_THICKNESS = 0.025;
const ARCHITRAVE_WIDTH = 0.06; // flat casing around a door opening
const ARCHITRAVE_DEPTH = 0.012;

/** Merge and sort spans, so overlapping doors don't produce duplicate gaps. */
function mergeSpans(spans: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** The runs of wall left over once `gaps` are removed from `0..length`. */
function invertSpans(length: number, gaps: { start: number; end: number }[]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const g of mergeSpans(gaps)) {
    if (g.start > cursor) runs.push({ start: cursor, end: Math.min(g.start, length) });
    cursor = Math.max(cursor, g.end);
  }
  if (cursor < length) runs.push({ start: cursor, end: length });
  return runs.filter((r) => r.end - r.start > 0.02);
}

interface Piece {
  key: string;
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
  kind: 'skirting' | 'sill' | 'architrave';
}

/**
 * Lay out every trim piece for the document. Pure geometry — no three.js objects — so
 * it's cheap to recompute and easy to reason about.
 */
export function buildTrimPieces(doc: SceneDocument, centroid: { x: number; z: number }): Piece[] {
  const pieces: Piece[] = [];
  const openings = doc.openings ?? [];

  for (const room of doc.rooms ?? []) {
    for (const wall of room.walls ?? []) {
      const seg = wallSegment(wall);
      if (seg.length < 0.05) continue;

      // Point the normal into the room, so trim sits on the face people actually see.
      const mx = (wall.start.x + wall.end.x) / 2;
      const mz = (wall.start.z + wall.end.z) / 2;
      let nx = seg.normal.x;
      let nz = seg.normal.z;
      if ((mx - centroid.x) * nx + (mz - centroid.z) * nz > 0) {
        nx = -nx;
        nz = -nz;
      }
      const faceOffset = wall.thickness / 2;
      const rotationY = -seg.angle;

      const mine = openings.filter((o) => o.wallId === wall.id);
      const doors = mine.filter((o) => o.kind === 'door');

      // Position along the wall -> world, offset out from the wall face by `out`.
      const at = (along: number, out: number, y: number): [number, number, number] => [
        wall.start.x + seg.dir.x * along + nx * (faceOffset + out),
        y,
        wall.start.z + seg.dir.z * along + nz * (faceOffset + out),
      ];

      // Skirting runs the wall except where a door meets the floor. Windows sit above it.
      for (const run of invertSpans(seg.length, doors.map(openingSpan))) {
        const len = run.end - run.start;
        pieces.push({
          key: `skirt:${wall.id}:${run.start.toFixed(3)}`,
          position: at((run.start + run.end) / 2, SKIRTING_DEPTH / 2, SKIRTING_HEIGHT / 2),
          rotationY,
          size: [len, SKIRTING_HEIGHT, SKIRTING_DEPTH],
          kind: 'skirting',
        });
      }

      for (const o of mine) {
        const span = openingSpan(o);
        const mid = (span.start + span.end) / 2;

        if (o.kind === 'window') {
          // A sill: a ledge at the bottom of the opening, slightly wider than the hole.
          pieces.push({
            key: `sill:${o.id}`,
            position: at(mid, SILL_DEPTH / 2, o.sillHeight + SILL_THICKNESS / 2),
            rotationY,
            size: [o.width + ARCHITRAVE_WIDTH, SILL_THICKNESS, SILL_DEPTH],
            kind: 'sill',
          });
        } else {
          // Architrave: two jambs and a head, framing the door on the interior face.
          const head = o.sillHeight + o.height;
          for (const side of [-1, 1] as const) {
            pieces.push({
              key: `arch:${o.id}:${side}`,
              position: at(
                mid + side * (o.width / 2 + ARCHITRAVE_WIDTH / 2),
                ARCHITRAVE_DEPTH / 2,
                head / 2,
              ),
              rotationY,
              size: [ARCHITRAVE_WIDTH, head, ARCHITRAVE_DEPTH],
              kind: 'architrave',
            });
          }
          pieces.push({
            key: `arch:${o.id}:head`,
            position: at(mid, ARCHITRAVE_DEPTH / 2, head + ARCHITRAVE_WIDTH / 2),
            rotationY,
            size: [o.width + ARCHITRAVE_WIDTH * 2, ARCHITRAVE_WIDTH, ARCHITRAVE_DEPTH],
            kind: 'architrave',
          });
        }
      }
    }
  }
  return pieces;
}

/**
 * Renders the trim. Painted woodwork in practice is a shade off the wall colour, so it
 * reads as a separate element rather than an extrusion of the wall.
 */
export function Trim({
  doc,
  centroid,
  realism = false,
}: {
  doc: SceneDocument;
  centroid: { x: number; z: number };
  realism?: boolean;
}) {
  const pieces = useMemo(() => buildTrimPieces(doc, centroid), [doc, centroid]);
  const wallColor = doc.rooms[0]?.materials.wall.color ?? '#efeae2';
  const trimColor = useMemo(
    () => `#${new THREE.Color(wallColor).lerp(new THREE.Color('#ffffff'), 0.35).getHexString()}`,
    [wallColor],
  );

  if (!realism || pieces.length === 0) return null;

  return (
    <group>
      {pieces.map((p) => (
        <mesh key={p.key} position={p.position} rotation={[0, p.rotationY, 0]} castShadow receiveShadow>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color={trimColor} roughness={0.45} envMapIntensity={0.5} />
        </mesh>
      ))}
    </group>
  );
}
