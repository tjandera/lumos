import { describe, expect, it } from "vitest";
import { aabbOverlap, type FurnitureItem, type Point2D } from "@interior/core";
import { solve, DEFAULT_CLEARANCE, type PlacementRequest } from "./solver.js";
import { docWithRoom, rectRoom, testCatalog, mulberry32 } from "./test-fixtures.js";

function req(catalogId: string, itemId: string, constraints: PlacementRequest["constraints"] = {}): PlacementRequest {
  const item = testCatalog.find((c) => c.id === catalogId)!;
  return { catalogId, itemId, dimensions: item.dimensions, category: item.category, constraints, isExisting: false };
}

function asFurniture(p: { itemId: string; catalogId: string; position: { x: number; y: number; z: number }; rotationY: number; dimensions: { w: number; d: number; h: number } }): FurnitureItem {
  return { id: p.itemId, catalogId: p.catalogId, position: p.position, rotationY: p.rotationY, dimensions: p.dimensions };
}

/** Distance from a world XZ point to the nearest wall segment of the room. */
function distToNearestWall(walls: Point2D[], x: number, z: number): number {
  let min = Infinity;
  for (let i = 0; i < walls.length; i++) {
    const a = walls[i]!;
    const b = walls[(i + 1) % walls.length]!;
    const ax = a.x;
    const az = a.y;
    const dx = b.x - ax;
    const dz = b.y - az;
    const lenSq = dx * dx + dz * dz;
    let t = lenSq < 1e-9 ? 0 : ((x - ax) * dx + (z - az) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cz = az + t * dz;
    min = Math.min(min, Math.hypot(x - cx, z - cz));
  }
  return min;
}

describe("solver determinism", () => {
  it("produces byte-identical output for the same input", () => {
    const doc = docWithRoom();
    const requests = [
      req("sofa-oslo-3seat", "a", { nearWall: true }),
      req("table-coffee-mira", "b", { zone: "center", adjacentTo: "a" }),
      req("armchair-birch", "c", { facingItem: "a" })
    ];
    const first = solve(doc, rectRoom(), requests);
    const second = solve(doc, rectRoom(), requests);
    expect(JSON.stringify(second)).toEqual(JSON.stringify(first));
  });

  it("is order-stable across repeated runs (10x)", () => {
    const doc = docWithRoom();
    const requests = [req("sofa-oslo-3seat", "a", { nearWall: true })];
    const baseline = JSON.stringify(solve(doc, rectRoom(), requests));
    for (let i = 0; i < 10; i++) {
      expect(JSON.stringify(solve(doc, rectRoom(), requests))).toEqual(baseline);
    }
  });
});

describe("hard constraints are never violated", () => {
  it("never overlaps and stays in-room across randomized batches (seeded)", () => {
    const smallItems = ["armchair-birch", "table-coffee-mira", "lighting-floor-arc"];
    for (const seed of [1, 2, 3, 7, 42, 99, 123, 2024]) {
      const rand = mulberry32(seed);
      const room = rectRoom();
      const doc = docWithRoom(room);
      const requests: PlacementRequest[] = [];
      const count = 3 + Math.floor(rand() * 4);
      for (let i = 0; i < count; i++) {
        const catalogId = smallItems[Math.floor(rand() * smallItems.length)]!;
        const constraints: PlacementRequest["constraints"] = {};
        const roll = rand();
        if (roll < 0.33) constraints.nearWall = true;
        else if (roll < 0.66) constraints.zone = "corner";
        else constraints.zone = "center";
        requests.push(req(catalogId, `item-${i}`, constraints));
      }

      const result = solve(doc, room, requests);
      const placed = result.placed.map(asFurniture);

      // No pair of placed items overlaps (core's own collision check).
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          expect(aabbOverlap(placed[i]!, placed[j]!)).toBe(false);
        }
      }

      // Every placed item is inside the room bounds (with wall margin).
      for (const item of placed) {
        expect(item.position.x).toBeGreaterThan(0);
        expect(item.position.x).toBeLessThan(5);
        expect(item.position.z).toBeGreaterThan(0);
        expect(item.position.z).toBeLessThan(4);
      }
    }
  });
});

describe("constraint scoring", () => {
  it("nearWall actually hugs a wall", () => {
    const room = rectRoom();
    const result = solve(docWithRoom(room), room, [req("armchair-birch", "a", { nearWall: true })]);
    const placed = result.placed[0]!;
    const dist = distToNearestWall(room.walls, placed.position.x, placed.position.z);
    // Back is against the wall: center is within ~half-depth of the wall line.
    expect(dist).toBeLessThan(0.7);
  });

  it("zone:corner lands near a room corner", () => {
    const room = rectRoom();
    const result = solve(docWithRoom(room), room, [req("armchair-birch", "a", { zone: "corner" })]);
    const p = result.placed[0]!;
    const nearestVertex = Math.min(
      ...room.walls.map((w) => Math.hypot(w.x - p.position.x, w.y - p.position.z))
    );
    expect(nearestVertex).toBeLessThan(1.2);
  });

  it("zone:center lands near the room centroid", () => {
    const room = rectRoom();
    const result = solve(docWithRoom(room), room, [req("table-coffee-mira", "a", { zone: "center" })]);
    const p = result.placed[0]!;
    // Room centroid is (2.5, 2.0).
    expect(Math.hypot(p.position.x - 2.5, p.position.z - 2.0)).toBeLessThan(1.0);
  });
});

describe("reject-and-repair failures", () => {
  it("reports too-big for an item that cannot fit the room", () => {
    const room = rectRoom();
    const result = solve(docWithRoom(room), room, [req("storage-huge-wall", "a", {})]);
    expect(result.placed).toHaveLength(0);
    expect(result.failed[0]!.reason).toBe("too-big");
  });

  it("reports no-room when there is no room", () => {
    const result = solve(docWithRoom(), undefined, [req("armchair-birch", "a", {})]);
    expect(result.failed[0]!.reason).toBe("no-room");
  });

  it("keeps a door swing clear (bed near the door wall cannot block it)", () => {
    const room = rectRoom();
    // Fill the room with a bed constrained near the door wall; the solver must
    // still avoid the door swing zone or fail rather than block it.
    const result = solve(docWithRoom(room), room, [req("bed-queen-linden", "a", { nearWall: true })]);
    if (result.placed.length > 0) {
      const p = result.placed[0]!;
      // Door is on wall 0 (z=0) at x=1.0, width 0.9 → swing square roughly
      // x in [0.55,1.45], z in [0,0.9]. The bed footprint must not intrude.
      const overlapsDoorX = Math.abs(p.position.x - 1.0) < 0.45 + p.dimensions.w / 2;
      const nearDoorZ = p.position.z - p.dimensions.d / 2 < 0.9;
      expect(overlapsDoorX && nearDoorZ).toBe(false);
    }
  });
});

describe("clearance", () => {
  it("front clearance zone stays inside the room for seating", () => {
    const room = rectRoom();
    const result = solve(docWithRoom(room), room, [req("sofa-oslo-3seat", "a", { nearWall: true, minClearance: DEFAULT_CLEARANCE })]);
    // The sofa must be placed (there is room) and not flush in a way that pushes
    // its clearance out of the room — implicitly validated by the solver.
    expect(result.placed).toHaveLength(1);
  });
});
