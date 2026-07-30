import { create } from 'zustand';
import { initialQuality, readDeviceSignals } from './perfProfile';

export type ViewMode = '3d' | 'plan';
export type SunMode = 'auto' | 'manual';
export type Quality = 'low' | 'med' | 'high';
export type Weather = 'clear' | 'hazy' | 'overcast' | 'golden';

/** One captured render from the day-cycle light study. */
export interface LightStudyFrame {
  /** Minutes past local midnight this frame was rendered at. */
  minutes: number;
  /** JPEG data URL of the canvas at that instant. */
  dataUrl: string;
}

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
  setLightingOpen: (v: boolean) => void;
  materialsOpen: boolean;
  toggleMaterials: () => void;

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

  // --- Phase 10: realism ---
  /** Cinematic lighting: time-of-day sky IBL, window fill, soft shadows, lamp glow. */
  enhancedRealism: boolean;
  toggleEnhancedRealism: () => void;
  /** One-shot high-quality capture: not offline path-traced GI, just every quality
   * setting maxed + higher resolution, captured as a PNG. See LIGHTING_ROADMAP.md. */
  photoRequested: boolean;
  photoBusy: boolean;
  photoResult: string | null;
  requestPhoto: () => void;
  finishPhoto: (dataUrl: string) => void;

  // --- Light study: a scrubbable stack of real renders across one day ---
  lightStudyOpen: boolean;
  toggleLightStudy: () => void;
  /** Set to start a capture run; LightStudyCapture clears it once it takes over. */
  lightStudyRequested: boolean;
  lightStudyBusy: boolean;
  /** 0..1 while capturing, for the progress readout. */
  lightStudyProgress: number;
  lightStudyFrames: LightStudyFrame[];
  /** Index into `lightStudyFrames` the slider is currently showing. */
  lightStudyIndex: number;
  requestLightStudy: () => void;
  setLightStudyProgress: (p: number) => void;
  finishLightStudy: (frames: LightStudyFrame[]) => void;
  setLightStudyIndex: (i: number) => void;
  /** Auto-advancing playback of the captured day (panel-only; unrelated to the live
   *  scene's own sun animation). */
  lightStudyPlaying: boolean;
  setLightStudyPlaying: (v: boolean) => void;
  clearLightStudy: () => void;
  clearPhotoResult: () => void;

  // --- Phase 13: selected light fixture (Plan-mode editing) ---
  selectedLightId: string | null;
  selectLight: (id: string | null) => void;

  /** Selected wall/opening in the Plan editor — lives here (not local component state)
   * so a single global keyboard-shortcut handler can act on whichever kind of thing is
   * currently selected. */
  planSelection: { type: 'wall' | 'opening'; id: string } | null;
  setPlanSelection: (s: { type: 'wall' | 'opening'; id: string } | null) => void;

  /** Snap edits to the 0.1 m grid. Shared by the Plan editor and the 3D move gizmo so
   * the two editors don't disagree about where things land. */
  snapEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  /** What the 3D gizmo does when furniture is selected. */
  gizmoMode: 'translate' | 'rotate';
  setGizmoMode: (m: 'translate' | 'rotate') => void;

  /** Guided first-run walkthrough (see tour/). Replayable from the Help button. */
  tourOpen: boolean;
  setTourOpen: (v: boolean) => void;

  // --- Map location picker ---
  locationOpen: boolean;
  toggleLocation: () => void;
  setLocationOpen: (v: boolean) => void;

  // --- Photo-based room import ---
  importOpen: boolean;
  toggleImport: () => void;
  importBusy: boolean;
  importError: string | null;
  /** The uploaded photo (data URL), kept around so it can be pinned as a reference
   * while refining the generated room — not persisted with the scene document. */
  referencePhoto: string | null;
  showReferencePhoto: boolean;
  toggleReferencePhoto: () => void;
  /** True right after a successful import, until the guided location/orientation step
   * is acknowledged — forces those Lighting-panel sections open once. */
  justImportedRoom: boolean;
  /** Furniture the last import couldn't match to the catalog, and the model's own notes
   * — surfaced once as a dismissible summary. */
  importSkipped: string[];
  importNotes: string | null;
  /** GPS coordinates read client-side from the uploaded photo's EXIF, if present —
   * never sent anywhere, only offered as a one-click prefill for the site location. */
  photoGps: { lat: number; lng: number } | null;
  setPhotoGps: (gps: { lat: number; lng: number } | null) => void;
  startImportRequest: () => void;
  importSucceeded: (result: { photoDataUrl: string; skipped: string[]; notes?: string }) => void;
  importFailed: (message: string) => void;
  dismissJustImported: () => void;
  dismissImportSummary: () => void;
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
  // Chosen from what the device actually is, not a fixed guess. The fps governor is
  // reactive and can't see a machine that holds 120fps by pinning its GPU — starting
  // from hardware signals is what keeps a laptop from heating up before it can react.
  quality: initialQuality(readDeviceSignals()),
  setQuality: (quality) => set({ quality }),
  lightingOpen: false,
  toggleLighting: () => set((s) => ({ lightingOpen: !s.lightingOpen })),
  setLightingOpen: (lightingOpen) => set({ lightingOpen }),
  materialsOpen: false,
  toggleMaterials: () => set((s) => ({ materialsOpen: !s.materialsOpen })),

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

  enhancedRealism: true,
  toggleEnhancedRealism: () => set((s) => ({ enhancedRealism: !s.enhancedRealism })),
  photoRequested: false,
  photoBusy: false,
  photoResult: null,
  requestPhoto: () => set({ photoRequested: true, photoBusy: true, photoResult: null }),
  finishPhoto: (photoResult) => set({ photoRequested: false, photoBusy: false, photoResult }),

  lightStudyOpen: false,
  toggleLightStudy: () => set((s) => ({ lightStudyOpen: !s.lightStudyOpen })),
  lightStudyRequested: false,
  lightStudyBusy: false,
  lightStudyProgress: 0,
  lightStudyFrames: [],
  lightStudyIndex: 0,
  requestLightStudy: () =>
    set({ lightStudyRequested: true, lightStudyBusy: true, lightStudyProgress: 0, lightStudyFrames: [] }),
  setLightStudyProgress: (lightStudyProgress) => set({ lightStudyProgress }),
  finishLightStudy: (lightStudyFrames) =>
    set({
      lightStudyRequested: false,
      lightStudyBusy: false,
      lightStudyProgress: 1,
      lightStudyFrames,
      // Open on the middle of the day rather than midnight, which is the frame most
      // likely to actually show the room.
      lightStudyIndex: Math.floor(lightStudyFrames.length / 2),
    }),
  setLightStudyIndex: (lightStudyIndex) => set({ lightStudyIndex }),
  lightStudyPlaying: false,
  setLightStudyPlaying: (lightStudyPlaying) => set({ lightStudyPlaying }),
  clearLightStudy: () =>
    set({ lightStudyFrames: [], lightStudyIndex: 0, lightStudyProgress: 0, lightStudyBusy: false, lightStudyRequested: false }),
  clearPhotoResult: () => set({ photoResult: null }),

  selectedLightId: null,
  selectLight: (selectedLightId) => set({ selectedLightId }),

  planSelection: null,
  setPlanSelection: (planSelection) => set({ planSelection }),

  snapEnabled: true,
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  gizmoMode: 'translate',
  setGizmoMode: (gizmoMode) => set({ gizmoMode }),

  // Opened on first run by App once the UI has mounted, so targets exist to point at.
  tourOpen: false,
  setTourOpen: (tourOpen) => set({ tourOpen }),

  locationOpen: false,
  toggleLocation: () => set((s) => ({ locationOpen: !s.locationOpen })),
  setLocationOpen: (locationOpen) => set({ locationOpen }),

  importOpen: false,
  toggleImport: () => set((s) => ({ importOpen: !s.importOpen })),
  importBusy: false,
  importError: null,
  referencePhoto: null,
  showReferencePhoto: false,
  toggleReferencePhoto: () => set((s) => ({ showReferencePhoto: !s.showReferencePhoto })),
  justImportedRoom: false,
  importSkipped: [],
  importNotes: null,
  photoGps: null,
  setPhotoGps: (photoGps) => set({ photoGps }),
  startImportRequest: () => set({ importBusy: true, importError: null }),
  importSucceeded: ({ photoDataUrl, skipped, notes }) =>
    set({
      importBusy: false,
      importOpen: false,
      referencePhoto: photoDataUrl,
      showReferencePhoto: true,
      justImportedRoom: true,
      importSkipped: skipped,
      importNotes: notes ?? null,
    }),
  importFailed: (importError) => set({ importBusy: false, importError }),
  dismissJustImported: () => set({ justImportedRoom: false }),
  dismissImportSummary: () => set({ importSkipped: [], importNotes: null }),
}));
