import { describe, expect, it } from "vitest";
import type { SceneDocument } from "@interior/core";
import { createEmptyDocument } from "@interior/core";
import {
  documentWorldBounds,
  fitSunShadowCamera,
  skyColors,
  smoothstep,
  sunColor,
  sunIntensity,
  MAX_SUN_INTENSITY,
  type Bounds3
} from "./lightingMath.js";

const DEG = Math.PI / 180;

describe("smoothstep", () => {
  it("clamps and eases between edges", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 6);
    expect(smoothstep(2, 2, 5)).toBe(1);
  });
});

describe("sunIntensity", () => {
  it("is zero well below the horizon and positive above it", () => {
    expect(sunIntensity(-10 * DEG)).toBe(0);
    expect(sunIntensity(-5 * DEG)).toBe(0);
    expect(sunIntensity(10 * DEG)).toBeGreaterThan(0);
  });

  it("increases monotonically with elevation above the horizon", () => {
    const low = sunIntensity(5 * DEG);
    const mid = sunIntensity(30 * DEG);
    const high = sunIntensity(80 * DEG);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high).toBeLessThanOrEqual(MAX_SUN_INTENSITY + 1e-6);
  });

  it("is dim near the horizon compared with midday", () => {
    expect(sunIntensity(3 * DEG)).toBeLessThan(0.4 * sunIntensity(60 * DEG));
  });
});

describe("sunColor", () => {
  it("is warm (orange) near the horizon and cooler/whiter high up", () => {
    const horizon = sunColor(1 * DEG);
    const zenith = sunColor(80 * DEG);
    // Warm light has much less blue than green/red.
    expect(horizon.b).toBeLessThan(horizon.r);
    expect(horizon.b).toBeLessThan(horizon.g);
    // Higher sun is bluer (whiter) than the horizon sun.
    expect(zenith.b).toBeGreaterThan(horizon.b);
  });
});

describe("skyColors", () => {
  it("is dark and low-intensity at night, bright in the day", () => {
    const night = skyColors(-20 * DEG);
    const day = skyColors(60 * DEG);
    expect(night.hemiIntensity).toBeLessThan(day.hemiIntensity);
    expect(night.envIntensity).toBeLessThan(day.envIntensity);
    // Day zenith is a brighter blue than the near-black night zenith.
    expect(day.zenith.b).toBeGreaterThan(night.zenith.b);
    // Some non-zero ambient fill remains at night so scenes stay readable.
    expect(night.hemiIntensity).toBeGreaterThan(0);
  });
});

describe("documentWorldBounds", () => {
  it("returns null for an empty document", () => {
    expect(documentWorldBounds(createEmptyDocument("e"))).toBeNull();
  });

  it("covers room footprint (plan-Y -> world-Z) and ceiling height", () => {
    const doc: SceneDocument = {
      ...createEmptyDocument("r"),
      rooms: [
        {
          id: "room-1",
          name: "R",
          walls: [
              { id: "w0", start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: 0.15, height: 2.5 },
              { id: "w1", start: { x: 4, z: 0 }, end: { x: 4, z: 3 }, thickness: 0.15, height: 2.5 },
              { id: "w2", start: { x: 4, z: 3 }, end: { x: 0, z: 3 }, thickness: 0.15, height: 2.5 },
              { id: "w3", start: { x: 0, z: 3 }, end: { x: 0, z: 0 }, thickness: 0.15, height: 2.5 }
          ],
            materials: {
              wall: { color: "#efeae2", finish: "matte" },
              floor: { color: "#d9d2c7", finish: "matte" },
              ceiling: { color: "#f5f2ea", finish: "matte" }
            }
        }
      ]
    };
    const b = documentWorldBounds(doc)!;
    expect(b.min).toEqual({ x: 0, y: 0, z: 0 });
    expect(b.max.x).toBe(4);
    expect(b.max.z).toBe(3);
    expect(b.max.y).toBe(2.5);
  });
});

describe("fitSunShadowCamera", () => {
  const bounds: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2.5, z: 3 } };

  it("places the light on the sun side of the room, aimed at its center", () => {
    const toSun = { x: 0, y: 1, z: 0 };
    const fit = fitSunShadowCamera(bounds, toSun);
    expect(fit.target).toEqual({ x: 2, y: 1.25, z: 1.5 });
    // Light sits above the room when the sun is overhead.
    expect(fit.position.y).toBeGreaterThan(bounds.max.y);
    // Position is displaced along +toSun from the center.
    const d = {
      x: fit.position.x - fit.target.x,
      y: fit.position.y - fit.target.y,
      z: fit.position.z - fit.target.z
    };
    expect(d.x * toSun.x + d.y * toSun.y + d.z * toSun.z).toBeGreaterThan(0);
  });

  it("produces a valid, room-covering ortho frustum", () => {
    const fit = fitSunShadowCamera(bounds, { x: 1, y: 1, z: 0.5 });
    expect(fit.near).toBeGreaterThan(0);
    expect(fit.far).toBeGreaterThan(fit.near);
    // Half-extent must cover at least half the largest horizontal span.
    expect(fit.halfExtent).toBeGreaterThanOrEqual(2);
  });

  it("normalizes a non-unit sun direction", () => {
    const fitUnit = fitSunShadowCamera(bounds, { x: 0, y: 1, z: 0 });
    const fitScaled = fitSunShadowCamera(bounds, { x: 0, y: 10, z: 0 });
    expect(fitScaled.position.y).toBeCloseTo(fitUnit.position.y, 6);
  });
});
