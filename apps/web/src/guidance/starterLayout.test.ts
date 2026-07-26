import { describe, expect, it } from "vitest";
import { aabbOverlap, createEmptyDocument, type Room, type SceneDocument } from "@interior/core";
import { arrangeForMe, ROOM_TYPE_OPTIONS, type RoomType } from "./starterLayout";

function rect(w: number, d: number, id = "room-1"): Room {
  return {
    id,
    name: "Room",
    walls: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d }
    ],
    wallThickness: 0.1,
    height: 2.4,
    openings: []
  };
}

/** A minimal stand-in for the store's `batch()`: applies `mutate` to the
 *  given document and returns the result, with no history bookkeeping —
 *  enough to exercise `arrangeForMe`'s single-batch application without a
 *  React store. */
function makeBatch(getDoc: () => SceneDocument, setDoc: (doc: SceneDocument) => void) {
  return (_label: string, mutate: (doc: SceneDocument) => SceneDocument): SceneDocument => {
    const next = mutate(getDoc());
    setDoc(next);
    return next;
  };
}

const ROOM_TYPES: RoomType[] = ROOM_TYPE_OPTIONS.map((o) => o.value);
const ROOM_SIZES: [number, number][] = [
  [4, 3],
  [6, 4]
];

describe("arrangeForMe", () => {
  for (const [w, d] of ROOM_SIZES) {
    for (const roomType of ROOM_TYPES) {
      it(`produces a valid, non-colliding placement for "${roomType}" in a ${w}x${d}m room`, () => {
        const room = rect(w, d);
        let doc: SceneDocument = { ...createEmptyDocument("Test"), rooms: [room] };
        const batch = makeBatch(
          () => doc,
          (next) => {
            doc = next;
          }
        );

        const result = arrangeForMe(roomType, doc, room, batch);

        expect(result.applied).toBe(true);
        expect(result.placedCount).toBeGreaterThan(0);
        expect(doc.furniture.length).toBe(result.placedCount);

        // No pairwise footprint overlaps among placed items.
        for (let i = 0; i < doc.furniture.length; i++) {
          for (let j = i + 1; j < doc.furniture.length; j++) {
            expect(aabbOverlap(doc.furniture[i]!, doc.furniture[j]!)).toBe(false);
          }
        }

        // Every item stays within the room's outer bounds.
        for (const item of doc.furniture) {
          expect(item.position.x).toBeGreaterThanOrEqual(0);
          expect(item.position.x).toBeLessThanOrEqual(w);
          expect(item.position.z).toBeGreaterThanOrEqual(0);
          expect(item.position.z).toBeLessThanOrEqual(d);
        }
      });
    }
  }

  it("is a single undo-batchable operation (one `batch` call)", () => {
    const room = rect(6, 4);
    let doc: SceneDocument = { ...createEmptyDocument("Test"), rooms: [room] };
    let calls = 0;
    const batch = (label: string, mutate: (d: SceneDocument) => SceneDocument): SceneDocument => {
      calls += 1;
      doc = mutate(doc);
      return doc;
    };

    arrangeForMe("living", doc, room, batch);
    expect(calls).toBe(1);
  });

  it("reports plain-language failures when nothing can be placed", () => {
    // A tiny room too small for a double bed + wardrobe.
    const room = rect(0.5, 0.5);
    let doc: SceneDocument = { ...createEmptyDocument("Test"), rooms: [room] };
    const batch = makeBatch(
      () => doc,
      (next) => {
        doc = next;
      }
    );

    const result = arrangeForMe("bedroom", doc, room, batch);
    expect(result.applied).toBe(false);
    expect(result.placedCount).toBe(0);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(typeof result.failures[0]).toBe("string");
  });

  it("does not place anything (and reports no-room) when there is no room yet", () => {
    const doc: SceneDocument = createEmptyDocument("Test");
    let calls = 0;
    const batch = (_label: string, mutate: (d: SceneDocument) => SceneDocument): SceneDocument => {
      calls += 1;
      return mutate(doc);
    };
    const result = arrangeForMe("living", doc, undefined, batch);
    expect(result.applied).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
    expect(calls).toBe(0);
  });
});
