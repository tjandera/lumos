// Primary renderer: what apps/web actually mounts. Reads the SceneDocument directly
// (walls, materials, openings/coverings, furniture, fixtures) and owns dollhouse-fade,
// realism hooks, and the addressable furniture naming the 3D move/rotate gizmo depends on.
export { SceneView } from './SceneView.js';
export type { SceneViewProps } from './SceneView.js';

// Pure geometry construction (wall/floor BufferGeometries) — used by SceneView and
// independently unit-testable without a GL context.
export * from './geometry3d.js';

// An alternate room renderer + physically-based lighting rig, ported from the merged
// launchpad codebase. Schema-compatible with v6, but not yet wired into apps/web — kept
// available as a documented, working alternative rather than dead code.
export { RoomScene } from './RoomScene.js';
export type { RoomSceneProps } from './RoomScene.js';
export * from './lighting/lightingMath.js';
export * from './lighting/presets.js';
export { LightingRig } from './lighting/LightingRig.js';
export type { LightingRigProps } from './lighting/LightingRig.js';
