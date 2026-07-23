import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./document.js";
import {
  addLampLight,
  createLampLight,
  createSunLight,
  ensureSunLight,
  getLampForFurniture,
  getLampLights,
  getSunLight,
  removeLampLightsForFurniture,
  setLampOn,
  setSunLight,
  updateLampLight
} from "./lights.js";

describe("sun light document helpers", () => {
  it("setSunLight upserts a single sun and merges updates", () => {
    let doc = createEmptyDocument("t");
    expect(getSunLight(doc)).toBeUndefined();

    doc = setSunLight(doc, { latitude: 40, longitude: -3 });
    const sun = getSunLight(doc);
    expect(sun?.latitude).toBe(40);
    expect(sun?.longitude).toBe(-3);

    doc = setSunLight(doc, { time: "18:00" });
    expect(getSunLight(doc)?.time).toBe("18:00");
    // still latitude from before (merge, not replace)
    expect(getSunLight(doc)?.latitude).toBe(40);
    // exactly one sun
    expect(doc.lights.filter((l) => l.type === "sun")).toHaveLength(1);
  });

  it("ensureSunLight adds a default sun only when missing", () => {
    let doc = createEmptyDocument("t");
    doc = ensureSunLight(doc);
    expect(getSunLight(doc)).toBeDefined();
    const before = doc;
    doc = ensureSunLight(doc);
    expect(doc).toBe(before); // unchanged reference
  });

  it("createSunLight applies sensible defaults", () => {
    const sun = createSunLight();
    expect(sun.type).toBe("sun");
    expect(sun.northOffset).toBe(0);
    expect(sun.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("lamp light document helpers", () => {
  it("adds, finds, toggles and removes lamp lights by furniture id", () => {
    let doc = createEmptyDocument("t");
    const lamp = createLampLight("lamp-1", "furn-1");
    expect(lamp.on).toBe(true);

    doc = addLampLight(doc, lamp);
    expect(getLampLights(doc)).toHaveLength(1);
    expect(getLampForFurniture(doc, "furn-1")?.id).toBe("lamp-1");

    doc = setLampOn(doc, "lamp-1", false);
    expect(getLampForFurniture(doc, "furn-1")?.on).toBe(false);

    doc = updateLampLight(doc, "lamp-1", { intensity: 20, color: "#fff" });
    expect(getLampForFurniture(doc, "furn-1")?.intensity).toBe(20);

    doc = removeLampLightsForFurniture(doc, "furn-1");
    expect(getLampLights(doc)).toHaveLength(0);
  });

  it("rejects duplicate lamp ids and unknown updates", () => {
    let doc = createEmptyDocument("t");
    doc = addLampLight(doc, createLampLight("lamp-1", "furn-1"));
    expect(() => addLampLight(doc, createLampLight("lamp-1", "furn-2"))).toThrow();
    expect(() => updateLampLight(doc, "missing", { intensity: 1 })).toThrow();
  });

  it("removeLampLightsForFurniture is a no-op (same reference) when nothing matches", () => {
    let doc = createEmptyDocument("t");
    doc = addLampLight(doc, createLampLight("lamp-1", "furn-1"));
    const before = doc;
    doc = removeLampLightsForFurniture(doc, "furn-2");
    expect(doc).toBe(before);
  });
});
