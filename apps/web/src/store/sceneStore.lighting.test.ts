import { beforeEach, describe, expect, it } from "vitest";
import { getLampLights, getSunLight } from "@interior/core";
import { useSceneStore } from "./sceneStore";

beforeEach(() => {
  useSceneStore.getState().reset();
});

describe("sun light actions", () => {
  it("a fresh document already has a sun light", () => {
    expect(getSunLight(useSceneStore.getState().document)).toBeDefined();
  });

  it("setSunLight merges fields and records one undo step", () => {
    const { setSunLight } = useSceneStore.getState();
    const before = useSceneStore.getState().history.past.length;

    setSunLight({ latitude: 40, longitude: -3 });
    let sun = getSunLight(useSceneStore.getState().document);
    expect(sun?.latitude).toBe(40);
    expect(useSceneStore.getState().history.past.length).toBe(before + 1);

    setSunLight({ time: "18:30" });
    sun = getSunLight(useSceneStore.getState().document);
    expect(sun?.time).toBe("18:30");
    expect(sun?.latitude).toBe(40); // merged, not replaced
  });

  it("setLightingQuality is UI-only state (no history entry)", () => {
    const before = useSceneStore.getState().history.past.length;
    useSceneStore.getState().setLightingQuality("high");
    expect(useSceneStore.getState().lightingQuality).toBe("high");
    expect(useSceneStore.getState().history.past.length).toBe(before);
  });
});

describe("transient sun-slider coalescing", () => {
  it("collapses a run of transient edits into a single undo step", () => {
    const { setSunLight, commitSunLight } = useSceneStore.getState();
    setSunLight({ time: "12:00" }); // commit baseline
    const past = useSceneStore.getState().history.past.length;

    setSunLight({ time: "12:01" }, { transient: true });
    setSunLight({ time: "12:02" }, { transient: true });
    setSunLight({ time: "12:03" }, { transient: true });
    // No history entries accumulated mid-drag.
    expect(useSceneStore.getState().history.past.length).toBe(past);

    commitSunLight();
    expect(useSceneStore.getState().history.past.length).toBe(past + 1);
    expect(getSunLight(useSceneStore.getState().document)?.time).toBe("12:03");

    // A single undo returns to the pre-drag value.
    useSceneStore.getState().undo();
    expect(getSunLight(useSceneStore.getState().document)?.time).toBe("12:00");
  });

  it("commitSunLight with no pending transient is a no-op", () => {
    const before = useSceneStore.getState().history.past.length;
    useSceneStore.getState().commitSunLight();
    expect(useSceneStore.getState().history.past.length).toBe(before);
  });
});

describe("lamp lifecycle", () => {
  it("adding a lighting-category item also adds a lamp light (one undo step)", () => {
    const before = useSceneStore.getState().history.past.length;
    const id = useSceneStore.getState().addFurnitureItem("floor-lamp");
    expect(id).not.toBeNull();

    const doc = useSceneStore.getState().document;
    const lamps = getLampLights(doc);
    expect(lamps).toHaveLength(1);
    expect(lamps[0]!.furnitureItemId).toBe(id);
    expect(lamps[0]!.on).toBe(true);
    // furniture + lamp added in a single history entry
    expect(useSceneStore.getState().history.past.length).toBe(before + 1);
  });

  it("non-light furniture does not create a lamp light", () => {
    useSceneStore.getState().addFurnitureItem("sofa-3seat");
    expect(getLampLights(useSceneStore.getState().document)).toHaveLength(0);
  });

  it("toggleLamp flips on/off and is undoable", () => {
    const id = useSceneStore.getState().addFurnitureItem("floor-lamp")!;
    useSceneStore.getState().toggleLamp(id);
    expect(getLampLights(useSceneStore.getState().document)[0]!.on).toBe(false);
    useSceneStore.getState().toggleLamp(id, true);
    expect(getLampLights(useSceneStore.getState().document)[0]!.on).toBe(true);

    useSceneStore.getState().undo();
    expect(getLampLights(useSceneStore.getState().document)[0]!.on).toBe(false);
  });

  it("removing a lamp item removes its lamp light", () => {
    const id = useSceneStore.getState().addFurnitureItem("floor-lamp")!;
    expect(getLampLights(useSceneStore.getState().document)).toHaveLength(1);
    useSceneStore.getState().removeFurnitureItem(id);
    expect(getLampLights(useSceneStore.getState().document)).toHaveLength(0);
    expect(useSceneStore.getState().document.furniture).toHaveLength(0);
  });
});
