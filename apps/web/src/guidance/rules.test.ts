import { describe, expect, it } from "vitest";
import { createEmptyDocument, type FurnitureItem, type Room, type SceneDocument } from "@interior/core";
import {
  computeAdvisories,
  prioritizeAdvisories,
  MAX_ADVISORIES,
  type Advisory,
  type GuidanceCatalogItem
} from "./rules";

const catalog: GuidanceCatalogItem[] = [
  { id: "sofa-3seat", name: "3-Seat Sofa", category: "seating" },
  { id: "armchair", name: "Armchair", category: "seating" },
  { id: "wardrobe", name: "Wardrobe", category: "storage" },
  { id: "bed-double", name: "Double Bed", category: "beds" },
  { id: "tv-stand", name: "TV Stand", category: "media" },
  { id: "floor-lamp", name: "Floor Lamp", category: "lighting" }
];

function room5x4(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    name: "Room",
    walls: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 }
    ],
    wallThickness: 0.1,
    height: 2.5,
    openings: [
      { id: "door-1", type: "door", wallIndex: 0, position: 1.0, width: 0.9, height: 2.0, sillHeight: 0 },
      { id: "win-1", type: "window", wallIndex: 2, position: 2.5, width: 1.4, height: 1.2, sillHeight: 0.9 }
    ],
    ...overrides
  };
}

function docWith(room: Room, furniture: FurnitureItem[]): SceneDocument {
  const doc = createEmptyDocument("Test");
  return { ...doc, rooms: [room], furniture };
}

function item(overrides: Partial<FurnitureItem> & Pick<FurnitureItem, "id" | "catalogId">): FurnitureItem {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    dimensions: { w: 1, d: 1, h: 1 },
    ...overrides
  };
}

describe("blocking-door rule", () => {
  it("triggers when an item's footprint intersects the door swing zone", () => {
    const room = room5x4();
    const wardrobe = item({
      id: "f1",
      catalogId: "wardrobe",
      position: { x: 1, y: 0, z: 0.3 },
      dimensions: { w: 1.2, d: 0.6, h: 2.1 }
    });
    const doc = docWith(room, [wardrobe]);
    const advisories = computeAdvisories(doc, room, catalog);
    const hit = advisories.find((a) => a.rule === "blocking-door");
    expect(hit).toBeDefined();
    expect(hit?.itemIds).toEqual(["f1"]);
    expect(hit?.message).toMatch(/wardrobe/i);
    expect(hit?.message).toMatch(/blocks the door/i);
  });

  it("does not trigger when the item is well clear of the door", () => {
    const room = room5x4();
    const wardrobe = item({
      id: "f1",
      catalogId: "wardrobe",
      position: { x: 4, y: 0, z: 3.3 },
      dimensions: { w: 1.2, d: 0.6, h: 2.1 }
    });
    const doc = docWith(room, [wardrobe]);
    const advisories = computeAdvisories(doc, room, catalog);
    expect(advisories.find((a) => a.rule === "blocking-door")).toBeUndefined();
  });
});

describe("too-tight rule", () => {
  it("triggers when the walkway in front of a seat is squeezed against a wall", () => {
    const room = room5x4();
    const armchair = item({
      id: "f1",
      catalogId: "armchair",
      position: { x: 2.5, y: 0, z: 3.5 },
      dimensions: { w: 0.85, d: 0.85, h: 0.8 },
      rotationY: 0
    });
    const doc = docWith(room, [armchair]);
    const advisories = computeAdvisories(doc, room, catalog);
    const hit = advisories.find((a) => a.rule === "too-tight");
    expect(hit).toBeDefined();
    expect(hit?.itemIds).toEqual(["f1"]);
    expect(hit?.message).toMatch(/60 cm/);
  });

  it("does not trigger with a clear walkway", () => {
    const room = room5x4();
    const armchair = item({
      id: "f1",
      catalogId: "armchair",
      position: { x: 2.5, y: 0, z: 2 },
      dimensions: { w: 0.85, d: 0.85, h: 0.8 },
      rotationY: 0
    });
    const doc = docWith(room, [armchair]);
    const advisories = computeAdvisories(doc, room, catalog);
    expect(advisories.find((a) => a.rule === "too-tight")).toBeUndefined();
  });

  it("triggers when another item blocks the walkway", () => {
    const room = room5x4();
    const sofa = item({
      id: "f1",
      catalogId: "sofa-3seat",
      position: { x: 2.5, y: 0, z: 1 },
      dimensions: { w: 2.1, d: 0.9, h: 0.8 },
      rotationY: 0
    });
    const blocker = item({
      id: "f2",
      catalogId: "wardrobe",
      position: { x: 2.5, y: 0, z: 1.7 },
      dimensions: { w: 1, d: 0.5, h: 1 },
      rotationY: 0
    });
    const doc = docWith(room, [sofa, blocker]);
    const advisories = computeAdvisories(doc, room, catalog);
    expect(advisories.some((a) => a.rule === "too-tight" && a.itemIds.includes("f1"))).toBe(true);
  });
});

describe("tv-viewing rule", () => {
  it("triggers when the TV stand is too close to the sofa", () => {
    const room = room5x4();
    const sofa = item({ id: "sofa", catalogId: "sofa-3seat", position: { x: 1, y: 0, z: 1 } });
    const tv = item({ id: "tv", catalogId: "tv-stand", position: { x: 1, y: 0, z: 1.5 } });
    const doc = docWith(room, [sofa, tv]);
    const advisories = computeAdvisories(doc, room, catalog);
    const hit = advisories.find((a) => a.rule === "tv-viewing");
    expect(hit).toBeDefined();
    expect(hit?.itemIds.sort()).toEqual(["sofa", "tv"]);
  });

  it("triggers when the TV stand is too far from the sofa", () => {
    const room = room5x4();
    const sofa = item({ id: "sofa", catalogId: "sofa-3seat", position: { x: 1, y: 0, z: 0.5 } });
    const tv = item({ id: "tv", catalogId: "tv-stand", position: { x: 1, y: 0, z: 4.5 } });
    const doc = docWith(room, [sofa, tv]);
    const advisories = computeAdvisories(doc, room, catalog);
    expect(advisories.find((a) => a.rule === "tv-viewing")).toBeDefined();
  });

  it("does not trigger within the comfortable viewing band", () => {
    const room = room5x4();
    const sofa = item({ id: "sofa", catalogId: "sofa-3seat", position: { x: 1, y: 0, z: 1 } });
    const tv = item({ id: "tv", catalogId: "tv-stand", position: { x: 1, y: 0, z: 3.5 } });
    const doc = docWith(room, [sofa, tv]);
    const advisories = computeAdvisories(doc, room, catalog);
    expect(advisories.find((a) => a.rule === "tv-viewing")).toBeUndefined();
  });

  it("does not trigger without both a tv-stand and a sofa", () => {
    const room = room5x4();
    const tv = item({ id: "tv", catalogId: "tv-stand", position: { x: 1, y: 0, z: 1.5 } });
    const doc = docWith(room, [tv]);
    const advisories = computeAdvisories(doc, room, catalog);
    expect(advisories.find((a) => a.rule === "tv-viewing")).toBeUndefined();
  });
});

describe("bed-window rule", () => {
  it("triggers when a bed sits against the wall directly under a window", () => {
    const room = room5x4();
    const bed = item({
      id: "bed",
      catalogId: "bed-double",
      position: { x: 2.5, y: 0, z: 2.925 },
      dimensions: { w: 1.6, d: 2.05, h: 0.5 },
      rotationY: 0
    });
    const doc = docWith(room, [bed]);
    const advisories = computeAdvisories(doc, room, catalog);
    const hit = advisories.find((a) => a.rule === "bed-window");
    expect(hit).toBeDefined();
    expect(hit?.itemIds).toEqual(["bed"]);
    expect(hit?.message).toMatch(/window/i);
  });

  it("does not trigger for a bed away from any wall", () => {
    const room = room5x4();
    const bed = item({
      id: "bed",
      catalogId: "bed-double",
      position: { x: 2.5, y: 0, z: 2 },
      dimensions: { w: 1.6, d: 2.05, h: 0.5 },
      rotationY: 0
    });
    const doc = docWith(room, [bed]);
    const advisories = computeAdvisories(doc, room, catalog);
    expect(advisories.find((a) => a.rule === "bed-window")).toBeUndefined();
  });
});

describe("crowded rule", () => {
  it("triggers once furniture footprint passes ~40% of the floor area", () => {
    const room = room5x4({
      walls: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 }
      ]
    });
    const sofa = item({ id: "sofa", catalogId: "sofa-3seat", position: { x: 1, y: 0, z: 1 }, dimensions: { w: 2.1, d: 0.9, h: 0.8 } });
    const bed = item({ id: "bed", catalogId: "bed-double", position: { x: 1.5, y: 0, z: 1.5 }, dimensions: { w: 1.6, d: 2.05, h: 0.5 } });
    const doc = docWith(room, [sofa, bed]);
    const advisories = computeAdvisories(doc, room, catalog);
    expect(advisories.find((a) => a.rule === "crowded")).toBeDefined();
  });

  it("does not trigger for a lightly furnished room", () => {
    const room = room5x4({
      walls: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 }
      ]
    });
    const wardrobe = item({ id: "w1", catalogId: "wardrobe", position: { x: 1, y: 0, z: 1 }, dimensions: { w: 1.2, d: 0.6, h: 2.1 } });
    const doc = docWith(room, [wardrobe]);
    const advisories = computeAdvisories(doc, room, catalog);
    expect(advisories.find((a) => a.rule === "crowded")).toBeUndefined();
  });
});

describe("no room", () => {
  it("returns no advisories when there is no room", () => {
    const doc = createEmptyDocument("Test");
    expect(computeAdvisories(doc, undefined, catalog)).toEqual([]);
  });
});

describe("prioritizeAdvisories", () => {
  const make = (rule: Advisory["rule"], id: string): Advisory => ({ rule, id, message: id, itemIds: [] });

  it("orders by rule priority: blocking-door > too-tight > tv-viewing > bed-window > crowded", () => {
    const input: Advisory[] = [
      make("crowded", "c"),
      make("tv-viewing", "tv"),
      make("blocking-door", "door"),
      make("bed-window", "bw"),
      make("too-tight", "tt")
    ];
    const ordered = prioritizeAdvisories(input, 10);
    expect(ordered.map((a) => a.rule)).toEqual(["blocking-door", "too-tight", "tv-viewing", "bed-window", "crowded"]);
  });

  it("caps the result at the given max, defaulting to MAX_ADVISORIES", () => {
    const input: Advisory[] = [
      make("blocking-door", "d1"),
      make("blocking-door", "d2"),
      make("too-tight", "t1"),
      make("tv-viewing", "tv1"),
      make("crowded", "c1")
    ];
    expect(prioritizeAdvisories(input)).toHaveLength(MAX_ADVISORIES);
    expect(prioritizeAdvisories(input, 2)).toHaveLength(2);
  });

  it("is stable within the same rule (keeps input order)", () => {
    const input: Advisory[] = [make("crowded", "first"), make("crowded", "second")];
    expect(prioritizeAdvisories(input, 10).map((a) => a.id)).toEqual(["first", "second"]);
  });
});
