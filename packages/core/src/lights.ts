/**
 * Pure document helpers for the scene's light state. A document holds at most
 * one `SunLightConfig` plus zero-or-more `LampLightConfig`s (one per
 * light-emitting furniture item). All helpers return a new document and never
 * mutate in place, matching the rest of `@interior/core`.
 */

import type { LampLightConfig, LightSource, SceneDocument, SunLightConfig } from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

/** A sensible default sun for a fresh scene: London, summer afternoon, no plan offset. */
export function createSunLight(overrides: Partial<Omit<SunLightConfig, "type">> = {}): SunLightConfig {
  return {
    type: "sun",
    id: overrides.id ?? "sun",
    date: overrides.date ?? "2024-06-21",
    time: overrides.time ?? "15:00",
    latitude: overrides.latitude ?? 51.5074,
    longitude: overrides.longitude ?? -0.1278,
    northOffset: overrides.northOffset ?? 0
  };
}

/** The document's sun light, if one exists. */
export function getSunLight(doc: SceneDocument): SunLightConfig | undefined {
  return doc.lights.find((l): l is SunLightConfig => l.type === "sun");
}

/**
 * Upsert the single sun light, merging `updates` into the existing one (or a
 * default if none exists yet).
 */
export function setSunLight(doc: SceneDocument, updates: Partial<Omit<SunLightConfig, "type" | "id">>): SceneDocument {
  const existing = getSunLight(doc);
  const next: SunLightConfig = existing
    ? { ...existing, ...updates }
    : createSunLight(updates);
  const lights: LightSource[] = [next, ...doc.lights.filter((l) => l.type !== "sun")];
  return { ...doc, lights, meta: { ...doc.meta, updatedAt: nowIso() } };
}

/** Ensure a sun light exists; returns the document unchanged if one already does. */
export function ensureSunLight(doc: SceneDocument): SceneDocument {
  return getSunLight(doc) ? doc : setSunLight(doc, {});
}

/** All lamp lights in the document. */
export function getLampLights(doc: SceneDocument): LampLightConfig[] {
  return doc.lights.filter((l): l is LampLightConfig => l.type === "lamp");
}

/** The lamp light attached to a given furniture item, if any. */
export function getLampForFurniture(doc: SceneDocument, furnitureItemId: string): LampLightConfig | undefined {
  return getLampLights(doc).find((l) => l.furnitureItemId === furnitureItemId);
}

/** A default lamp light config for a furniture item (warm, on). */
export function createLampLight(
  id: string,
  furnitureItemId: string,
  overrides: Partial<Omit<LampLightConfig, "type" | "id" | "furnitureItemId">> = {}
): LampLightConfig {
  return {
    type: "lamp",
    id,
    furnitureItemId,
    intensity: overrides.intensity ?? 12,
    color: overrides.color ?? "#ffd9a0",
    on: overrides.on ?? true
  };
}

/** Append a lamp light. Throws on duplicate id. */
export function addLampLight(doc: SceneDocument, lamp: LampLightConfig): SceneDocument {
  if (doc.lights.some((l) => l.id === lamp.id)) {
    throw new Error(`Light with id "${lamp.id}" already exists`);
  }
  return { ...doc, lights: [...doc.lights, lamp], meta: { ...doc.meta, updatedAt: nowIso() } };
}

/** Remove any lamp light(s) attached to a furniture item (used when it is deleted). */
export function removeLampLightsForFurniture(doc: SceneDocument, furnitureItemId: string): SceneDocument {
  const lights = doc.lights.filter((l) => !(l.type === "lamp" && l.furnitureItemId === furnitureItemId));
  if (lights.length === doc.lights.length) return doc;
  return { ...doc, lights, meta: { ...doc.meta, updatedAt: nowIso() } };
}

/** Merge updates into a lamp light by id. Throws if not found. */
export function updateLampLight(
  doc: SceneDocument,
  lampId: string,
  updates: Partial<Omit<LampLightConfig, "type" | "id" | "furnitureItemId">>
): SceneDocument {
  const index = doc.lights.findIndex((l) => l.id === lampId && l.type === "lamp");
  if (index === -1) {
    throw new Error(`Lamp light with id "${lampId}" not found`);
  }
  const lights = [...doc.lights];
  lights[index] = { ...(lights[index] as LampLightConfig), ...updates };
  return { ...doc, lights, meta: { ...doc.meta, updatedAt: nowIso() } };
}

/** Toggle (or set) a lamp's on/off state. Throws if not found. */
export function setLampOn(doc: SceneDocument, lampId: string, on: boolean): SceneDocument {
  return updateLampLight(doc, lampId, { on });
}
