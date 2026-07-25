import type { FeatureName } from '@interior/core';

// Resolved from Vite env at build time. Enable the (WIP) AI assistant with
// VITE_FEATURE_AI=true, and photo-based room import with VITE_FEATURE_ROOM_PHOTO=true
// (e.g. in apps/web/.env.local).
export const FEATURES: Partial<Record<FeatureName, boolean>> = {
  ai: import.meta.env.VITE_FEATURE_AI === 'true',
  roomPhoto: import.meta.env.VITE_FEATURE_ROOM_PHOTO === 'true',
};
