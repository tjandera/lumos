/**
 * Canonical conventions for the entire scene graph. Documented ONCE here and
 * referenced everywhere. Changing any of these is a breaking, migration-worthy
 * change to the SceneDocument.
 *
 * - Distance unit: METERS. Every length / coordinate in a SceneDocument is meters.
 * - Coordinate system: three.js default — right-handed, Y-up.
 *     - The floor plan lives on the X/Z ground plane; Y = 0 is the floor, +Y is up.
 * - Angles: stored in DEGREES in the document (human-friendly, JSON-stable) and
 *   converted to radians only inside the renderer.
 * - North: `site.trueNorthOffsetDeg` is the rotation (degrees, clockwise looking
 *   down the +Y axis) from the document's +Z axis to real-world north — used to
 *   align the sun. 0 means "+Z points north".
 * - Light: lamp intensities are physical (candela). See the renderer's lighting rig.
 */
export const METERS = 1;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
