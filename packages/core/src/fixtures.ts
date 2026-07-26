import type { FixtureKind } from './schema.js';

/** Mount height (meters) each fixture kind is placed at when added — ceiling/wall fixtures
 * mount high, floor/table fixtures sit low. Shared by the manual "+ Fixture" buttons and the
 * photo-import materializer so both place fixtures the same way. */
export const FIXTURE_MOUNT_HEIGHT: Record<FixtureKind, number> = {
  ceiling: 2.6,
  wall: 1.8,
  floor: 0.05,
  table: 0.75,
};
