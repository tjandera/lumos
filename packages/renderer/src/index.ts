export { SceneView } from "./SceneView.js";
export type { SceneViewProps } from "./SceneView.js";

export { computeWallShape, buildWallGeometry } from "./wallGeometry.js";
export type { WallShape2D, WallHole } from "./wallGeometry.js";

export { RoomScene } from "./RoomScene.js";
export type { RoomSceneProps } from "./RoomScene.js";

// Lighting rig
export * from "./lighting/lightingMath.js";
export * from "./lighting/presets.js";
export { createSkyEnvironment } from "./lighting/environment.js";
export { LightingRig } from "./lighting/LightingRig.js";
export type { LightingRigProps } from "./lighting/LightingRig.js";
export {
  createRealismMaterial,
  applyRealismMaterials,
  fabricTexture,
  woodTexture,
  plasterTexture,
  carpetTexture,
} from "./realismMaterials.js";
export { applyBoxUVs, writeBoxUVs, tilesPerMeterFor, TILES_PER_METER } from "./boxUVs.js";
export {
  familyForCategory,
  familyMaps,
  familyMapsWithRepeat,
  MATERIAL_FAMILIES,
  FAMILY_LABEL,
  FAMILY_FOR_CATEGORY,
} from "./pbrTextures.js";
export type { MaterialFamily, FamilyMaps } from "./pbrTextures.js";
export { Trim, buildTrimPieces } from "./Trim.js";
export { computeFitTransform } from "./modelFit.js";
export type { FitTransform, Box3Like } from "./modelFit.js";
