/**
 * Pure scene document model. No three.js dependency — this module must stay
 * renderer-agnostic so it can be shared between the web app, the API, and
 * the AI tool layer.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Dimensions3D {
  w: number;
  d: number;
  h: number;
}

/**
 * A wall opening (window or door) placed along a wall segment.
 * `position` is the distance in meters from the start of the wall segment
 * (identified by `wallIndex`, an index into the room's `walls` polyline
 * where the wall runs from `walls[wallIndex]` to `walls[wallIndex + 1]`,
 * wrapping to `walls[0]` for the closing segment).
 */
export interface Opening {
  id: string;
  type: "window" | "door";
  wallIndex: number;
  position: number;
  width: number;
  height: number;
  sillHeight: number;
}

/**
 * A room defined by a closed 2D polyline of wall corner points, a uniform
 * wall thickness, and a ceiling height. Openings reference wall segments by
 * index.
 */
export interface Room {
  id: string;
  name: string;
  walls: Point2D[];
  wallThickness: number;
  height: number;
  openings: Opening[];
}

export interface FurnitureItem {
  id: string;
  catalogId: string;
  position: Vector3;
  rotationY: number;
  dimensions: Dimensions3D;
}

export interface SunLightConfig {
  type: "sun";
  id: string;
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  northOffset: number;
}

export interface LampLightConfig {
  type: "lamp";
  id: string;
  furnitureItemId: string;
  intensity: number;
  color: string;
  on: boolean;
}

export type LightSource = SunLightConfig | LampLightConfig;

export interface SceneMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Coarse geographic siting for a design: the location used to drive sun
 * position and the plan's orientation relative to true north.
 *
 * PII boundary: this block deliberately holds ONLY coarse lat/lng + a north
 * offset. There is NO street address (or postcode/city) here or anywhere else
 * in the document — the home address is treated as PII and is kept out of the
 * shareable/serializable document entirely. See `siteSchema` in `schema.ts`,
 * which enforces this with a `.strict()` object plus a test asserting no
 * address-like keys exist.
 *
 * `trueNorthOffsetDeg` is stored in DEGREES here (a user-facing unit). Note the
 * sun light config's `northOffset` is in RADIANS; migration converts between
 * them. Both are kept in sync as of schema v2.
 */
export interface Site {
  lat: number;
  lng: number;
  trueNorthOffsetDeg: number;
}

/**
 * The current scene-document schema version. Documents saved before versioning
 * existed have no `schemaVersion` and are treated as version 1; `migrate()`
 * upgrades them to this version.
 */
export const CURRENT_SCHEMA_VERSION = 2;

export interface SceneDocument {
  /**
   * Schema version. Optional on the TS type only for backward-compatibility
   * with existing call sites that construct documents without it (a validated
   * v2 document — see `sceneDocumentSchema` — always has it set to
   * {@link CURRENT_SCHEMA_VERSION}). Documents without it are version 1.
   */
  schemaVersion?: number;
  /**
   * Coarse siting (lat/lng + true-north offset). Optional on the TS type for
   * the same backward-compat reason; a validated v2 document always has it.
   */
  site?: Site;
  meta: SceneMeta;
  rooms: Room[];
  furniture: FurnitureItem[];
  lights: LightSource[];
}
