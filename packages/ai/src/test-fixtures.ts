/**
 * Shared fixtures for the AI package tests. Not exported from the public index.
 */

import { createEmptyDocument, type Room, type SceneDocument } from "@interior/core";
import type { CatalogItem } from "./catalog.js";

/** A rectangular 5m x 4m room with one window and one door. */
export function rectRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    name: "Living Room",
    walls: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 }
    ],
    wallThickness: 0.1,
    height: 2.5,
    openings: [
      { id: "win-1", type: "window", wallIndex: 2, position: 2.5, width: 1.4, height: 1.2, sillHeight: 0.9 },
      { id: "door-1", type: "door", wallIndex: 0, position: 1.0, width: 0.9, height: 2.0, sillHeight: 0 }
    ],
    ...overrides
  };
}

/** A document containing a single rectangular room and no furniture. */
export function docWithRoom(room: Room = rectRoom()): SceneDocument {
  const doc = createEmptyDocument("Test", "doc-1");
  return { ...doc, rooms: [room] };
}

/** A small deterministic catalog covering the categories the solver cares about. */
export const testCatalog: CatalogItem[] = [
  {
    id: "sofa-oslo-3seat",
    name: "Oslo 3-Seat Sofa",
    category: "sofa",
    dimensions: { w: 2.1, d: 0.9, h: 0.85 },
    price: 899,
    color: "#8a8577",
    description: "A relaxed three-seat sofa."
  },
  {
    id: "armchair-birch",
    name: "Birch Lounge Armchair",
    category: "armchair",
    dimensions: { w: 0.8, d: 0.85, h: 0.78 },
    price: 349,
    color: "#c19a6b",
    description: "A compact armchair."
  },
  {
    id: "table-coffee-mira",
    name: "Mira Coffee Table",
    category: "table",
    dimensions: { w: 1.1, d: 0.55, h: 0.4 },
    price: 219,
    color: "#5a4632",
    description: "A low walnut coffee table."
  },
  {
    id: "lighting-floor-arc",
    name: "Arc Floor Lamp",
    category: "lighting",
    dimensions: { w: 0.35, d: 0.35, h: 1.65 },
    price: 159,
    color: "#1c1c1c",
    description: "An arched floor lamp."
  },
  {
    id: "bed-queen-linden",
    name: "Linden Queen Bed",
    category: "bed",
    dimensions: { w: 1.6, d: 2.1, h: 1.0 },
    price: 799,
    color: "#d9c9b6",
    description: "A queen-size platform bed."
  },
  {
    id: "storage-huge-wall",
    name: "Impossibly Huge Wall Unit",
    category: "storage",
    dimensions: { w: 9, d: 9, h: 2.4 },
    price: 5000,
    color: "#3d3226",
    description: "A unit far too large for the test room."
  }
];

/** A seedable, deterministic PRNG (mulberry32) for property-style tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
