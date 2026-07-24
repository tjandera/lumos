import { create } from 'zustand';

export type ViewMode = '3d' | 'plan';
export type SunMode = 'auto' | 'manual';
export type Quality = 'low' | 'med' | 'high';
export type Weather = 'clear' | 'hazy' | 'overcast' | 'golden';

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

  // --- Sun study + mood (7B/7C) ---
  /** Animate the sun across the day. */
  playing: boolean;
  togglePlaying: () => void;
  setPlaying: (v: boolean) => void;
  /** Overlay summer + winter sun paths. */
  showSeasons: boolean;
  toggleSeasons: () => void;
  weather: Weather;
  setWeather: (w: Weather) => void;
  /** Render exposure (ACES tone mapping). */
  exposure: number;
  setExposure: (v: number) => void;
  /** Sun colour temperature: −1 cool → +1 warm. */
  sunWarmth: number;
  setSunWarmth: (v: number) => void;
  /** Solar-exposure heatmap on the floor. */
  heatmapOn: boolean;
  toggleHeatmap: () => void;
  /** Illuminance (lux) heatmap + analysis. */
  luxOn: boolean;
  toggleLux: () => void;
  avgLux: number;
  setAvgLux: (v: number) => void;
  roomStandardId: string;
  setRoomStandardId: (id: string) => void;
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

  playing: false,
  togglePlaying: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (playing) => set({ playing }),
  showSeasons: false,
  toggleSeasons: () => set((s) => ({ showSeasons: !s.showSeasons })),
  weather: 'clear',
  setWeather: (weather) => set({ weather }),
  exposure: 1,
  setExposure: (exposure) => set({ exposure }),
  sunWarmth: 0,
  setSunWarmth: (sunWarmth) => set({ sunWarmth }),
  heatmapOn: false,
  toggleHeatmap: () => set((s) => ({ heatmapOn: !s.heatmapOn })),
  luxOn: false,
  toggleLux: () => set((s) => ({ luxOn: !s.luxOn })),
  avgLux: 0,
  setAvgLux: (avgLux) => set({ avgLux }),
  roomStandardId: 'living',
  setRoomStandardId: (roomStandardId) => set({ roomStandardId }),
}));
