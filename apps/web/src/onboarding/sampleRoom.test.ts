import { describe, expect, it } from "vitest";
import { buildSampleLivingRoomDocument } from "./sampleRoom";

describe("buildSampleLivingRoomDocument", () => {
  it("has exactly one 4m x 3.5m rectangular room and no furniture", () => {
    const doc = buildSampleLivingRoomDocument();
    expect(doc.rooms).toHaveLength(1);
    expect(doc.furniture).toHaveLength(0);

    const room = doc.rooms[0]!;
    expect(room.walls).toHaveLength(4);
    const xs = room.walls.map((p) => p.x);
    const ys = room.walls.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(4);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(3.5);
  });

  it("has one door and one window, both within their wall's bounds", () => {
    const doc = buildSampleLivingRoomDocument();
    const room = doc.rooms[0]!;
    expect(room.openings).toHaveLength(2);
    expect(room.openings.some((o) => o.type === "door")).toBe(true);
    expect(room.openings.some((o) => o.type === "window")).toBe(true);

    for (const opening of room.openings) {
      const a = room.walls[opening.wallIndex]!;
      const b = room.walls[(opening.wallIndex + 1) % room.walls.length]!;
      const wallLength = Math.hypot(b.x - a.x, b.y - a.y);
      expect(opening.position).toBeGreaterThanOrEqual(0);
      expect(opening.position + opening.width).toBeLessThanOrEqual(wallLength);
    }
  });

  it("produces a document with valid schema-required metadata (name, ids)", () => {
    const doc = buildSampleLivingRoomDocument();
    expect(doc.meta.name).toBe("Sample living room");
    expect(doc.rooms[0]!.id).toBeTruthy();
    for (const opening of doc.rooms[0]!.openings) {
      expect(opening.id).toBeTruthy();
    }
  });

  it("is deterministic in shape across calls (same dimensions/opening count)", () => {
    const a = buildSampleLivingRoomDocument();
    const b = buildSampleLivingRoomDocument();
    expect(a.rooms[0]!.walls).toEqual(b.rooms[0]!.walls);
    expect(a.rooms[0]!.openings.map((o) => o.type)).toEqual(b.rooms[0]!.openings.map((o) => o.type));
  });
});
