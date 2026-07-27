/**
 * Lamp + sun-time helpers for the AI executor.
 *
 * There is no "sun" light instance in the current schema — the sun is derived
 * from `document.view.timeOfDay` + `document.site` by the renderer (see
 * `@interior/core`'s `sunVector`). So "setting the time of day" just means
 * updating `view.timeOfDay`.
 *
 * A "lamp" is any `LightInstance` bound to a piece of furniture via
 * `furnitureItemId` (a floor/table lamp that travels with the item it sits
 * on). `kind` still records how it physically mounts (ceiling/wall/floor/table).
 */

import {
  kelvinToRgb,
  type FixtureKind,
  type LightInstance,
  type SceneDocument,
  type Vec3,
} from "@interior/core";

const DEFAULT_LAMP_KELVIN = 2700; // warm — typical incandescent/halogen lamp
const DEFAULT_LAMP_INTENSITY_CANDELA = 800;

function touch(document: SceneDocument): SceneDocument["meta"] {
  return { ...document.meta, updatedAt: new Date().toISOString() };
}

/** The lamp light bound to a given furniture item, if any. */
export function getLampForFurniture(document: SceneDocument, furnitureItemId: string): LightInstance | undefined {
  return document.lights.find((light) => light.furnitureItemId === furnitureItemId);
}

export interface CreateLampLightOptions {
  /** How the lamp mounts; defaults to "table" (a table/floor lamp). */
  kind?: FixtureKind;
  /** Initial on/off state; defaults to on. */
  on?: boolean;
  /** Color temperature; defaults to a warm 2700K (also drives `color`). */
  kelvin?: number;
  intensityCandela?: number;
  castShadow?: boolean;
  /** World position for the light; defaults to the origin (renderers that
   * track `furnitureItemId` typically re-derive position from the item itself). */
  position?: Vec3;
}

/** Build a new lamp `LightInstance` attached to a furniture item. Does not
 * mutate any document — pair with `addLampLight` to attach it. */
export function createLampLight(
  id: string,
  furnitureItemId: string,
  options: CreateLampLightOptions = {},
): LightInstance {
  const kelvin = options.kelvin ?? DEFAULT_LAMP_KELVIN;
  return {
    id,
    kind: options.kind ?? "table",
    position: options.position ?? { x: 0, y: 0, z: 0 },
    intensityCandela: options.intensityCandela ?? DEFAULT_LAMP_INTENSITY_CANDELA,
    color: kelvinToRgb(kelvin),
    kelvin,
    on: options.on ?? true,
    castShadow: options.castShadow ?? true,
    auto: false,
    furnitureItemId,
  };
}

/** Append a light fixture to the document. Throws if the id is already taken. */
export function addLampLight(document: SceneDocument, lamp: LightInstance): SceneDocument {
  if (document.lights.some((existing) => existing.id === lamp.id)) {
    throw new Error(`Light with id "${lamp.id}" already exists`);
  }
  return { ...document, lights: [...document.lights, lamp], meta: touch(document) };
}

/** Turn a light on/off by id. Throws if no light with that id exists. */
export function setLampOn(document: SceneDocument, lampId: string, on: boolean): SceneDocument {
  const index = document.lights.findIndex((light) => light.id === lampId);
  if (index === -1) throw new Error(`Light with id "${lampId}" not found`);
  const lights = [...document.lights];
  lights[index] = { ...lights[index]!, on };
  return { ...document, lights, meta: touch(document) };
}

/** Set the local datetime (ISO 8601, no timezone) that drives the sun position. */
export function setViewTimeOfDay(document: SceneDocument, timeOfDay: string): SceneDocument {
  return { ...document, view: { ...document.view, timeOfDay }, meta: touch(document) };
}
