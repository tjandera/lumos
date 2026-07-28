import type { FeatureName } from '@interior/core';

// Resolved from Vite env at build time. The AI assistant is ON by default (this is the
// hackathon-demo path) — set VITE_FEATURE_AI=false to hide it. Photo-based room import
// stays opt-in: set VITE_FEATURE_ROOM_PHOTO=true (e.g. in apps/web/.env.local).
export const FEATURES: Partial<Record<FeatureName, boolean>> = {
  ai: import.meta.env.VITE_FEATURE_AI !== 'false',
  roomPhoto: import.meta.env.VITE_FEATURE_ROOM_PHOTO === 'true',
};
