import { create } from 'zustand';

export type ViewMode = '3d' | 'plan';
export type SunMode = 'auto' | 'manual';
export type Quality = 'low' | 'med' | 'high';

interface UiStore {
  /** Which editor is showing: the 3D scene or the 2D floor plan. */
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  /** Dollhouse mode (3D): fade walls that face the camera so the interior is visible. */
  cutaway: boolean;
  toggleCutaway: () => void;
  /** Currently selected furniture item (shared across 3D and plan views). */
  selectedFurnitureId: string | null;
  selectFurniture: (id: string | null) => void;
  /** Minutes since midnight (site-local) for the sun scrubber. */
  timeMinutes: number;
  setTimeMinutes: (m: number) => void;

  // --- Lighting ---
  /** Auto = sun from time + location; Manual = sun from azimuth/elevation. */
  sunMode: SunMode;
  setSunMode: (m: SunMode) => void;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  setSunAngles: (az: number, el: number) => void;
  sunIntensity: number;
  setSunIntensity: (v: number) => void;
  showSun: boolean;
  toggleShowSun: () => void;
  showSunPath: boolean;
  toggleSunPath: () => void;
  quality: Quality;
  setQuality: (q: Quality) => void;
  lightingOpen: boolean;
  toggleLighting: () => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  mode: '3d',
  setMode: (mode) => set({ mode }),
  cutaway: true,
  toggleCutaway: () => set((s) => ({ cutaway: !s.cutaway })),
  selectedFurnitureId: null,
  selectFurniture: (selectedFurnitureId) => set({ selectedFurnitureId }),
  timeMinutes: 16 * 60,
  setTimeMinutes: (timeMinutes) => set({ timeMinutes }),

  sunMode: 'auto',
  setSunMode: (sunMode) => set({ sunMode }),
  sunAzimuthDeg: 135,
  sunElevationDeg: 45,
  setSunAngles: (sunAzimuthDeg, sunElevationDeg) => set({ sunAzimuthDeg, sunElevationDeg }),
  sunIntensity: 1,
  setSunIntensity: (sunIntensity) => set({ sunIntensity }),
  showSun: true,
  toggleShowSun: () => set((s) => ({ showSun: !s.showSun })),
  showSunPath: true,
  toggleSunPath: () => set((s) => ({ showSunPath: !s.showSunPath })),
  quality: 'med',
  setQuality: (quality) => set({ quality }),
  lightingOpen: false,
  toggleLighting: () => set((s) => ({ lightingOpen: !s.lightingOpen })),
}));
