import { useEffect } from 'react';
import { RefreshCw, Sun, Palette, Camera, Clock, Move, RotateCw, Sparkles, HelpCircle } from 'lucide-react';
import { isFeatureEnabled } from '@interior/core';
import { useSceneStore } from './store';
import { useUiStore, type ViewMode } from './uiStore';
import { Scene3D } from './Scene3D';
import { PlanEditor } from './PlanEditor';
import { PerfHud } from './PerfHud';
import { QualityGovernor } from './QualityGovernor';
import { CatalogPanel } from './CatalogPanel';
import { TimeOfDayBar } from './TimeOfDayBar';
import { AIPanel } from './AIPanel';
import { LightingPanel } from './LightingPanel';
import { MaterialsPanel } from './MaterialsPanel';
import { RoomImportPanel } from './RoomImportPanel';
import { ReferencePhotoPanel } from './ReferencePhotoPanel';
import { ImportSummaryBanner } from './ImportSummaryBanner';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import { SelectionStatus } from './SelectionStatus';
import { RoomStatus } from './RoomStatus';
import { WelcomeTips } from './WelcomeTips';
import { DesignTransfer } from './DesignTransfer';
import { PhotoResultModal } from './PhotoResultModal';
import { LocationPicker } from './location/LocationPicker';
import { DarkRoomNotice } from './DarkRoomNotice';
import { LightStudyPanel } from './LightStudyPanel';
import { Tour } from './tour/Tour';
import { tourSeen } from './tour/steps';
import { useLightStudyStatus } from './useLightStudyStatus';

export default function App() {
  const mode = useUiStore((s) => s.mode);
  const lightingOpen = useUiStore((s) => s.lightingOpen);
  const materialsOpen = useUiStore((s) => s.materialsOpen);
  const aiEnabled = isFeatureEnabled('ai');
  const roomPhotoEnabled = isFeatureEnabled('roomPhoto');
  const setTourOpen = useUiStore((s) => s.setTourOpen);
  useGlobalShortcuts();

  // First visit: run the walkthrough once the toolbar and panels have mounted, so every
  // step has a real element to point at.
  useEffect(() => {
    if (tourSeen()) return;
    const id = window.setTimeout(() => setTourOpen(true), 700);
    return () => window.clearTimeout(id);
  }, [setTourOpen]);

  return (
    <div className="relative h-full w-full bg-neutral-900">
      <Scene3D active={mode === '3d'} />
      {mode === 'plan' && <PlanEditor />}
      {mode === '3d' && <PerfHud />}
      <QualityGovernor />
      <DarkRoomNotice />
      <RoomStatus />
      {mode === '3d' && <TimeOfDayBar />}
      {mode === '3d' && <SelectionStatus />}
      {mode === '3d' && lightingOpen && <LightingPanel />}
      {mode === '3d' && materialsOpen && <MaterialsPanel />}
      <CatalogPanel />
      {aiEnabled && <AIPanel />}
      {roomPhotoEnabled && <RoomImportPanel />}
      <ReferencePhotoPanel />
      {roomPhotoEnabled && <ImportSummaryBanner />}
      <WelcomeTips />
      <PhotoResultModal />
      <LocationPicker />
      <LightStudyPanel />
      <Tour />
      <Toolbar aiEnabled={aiEnabled} roomPhotoEnabled={roomPhotoEnabled} mode={mode} />
    </div>
  );
}

function Toolbar({ aiEnabled, roomPhotoEnabled, mode }: { aiEnabled: boolean; roomPhotoEnabled: boolean; mode: ViewMode }) {
  const setMode = useUiStore((s) => s.setMode);
  const name = useSceneStore((s) => s.doc.meta.name);
  const canUndo = useSceneStore((s) => s.canUndo);
  const canRedo = useSceneStore((s) => s.canRedo);
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);
  const edit = useSceneStore((s) => s.edit);
  const reset = useSceneStore((s) => s.reset);
  const cutaway = useUiStore((s) => s.cutaway);
  const toggleCutaway = useUiStore((s) => s.toggleCutaway);
  const lightingOpen = useUiStore((s) => s.lightingOpen);
  const toggleLighting = useUiStore((s) => s.toggleLighting);
  const materialsOpen = useUiStore((s) => s.materialsOpen);
  const toggleMaterials = useUiStore((s) => s.toggleMaterials);
  const toggleImport = useUiStore((s) => s.toggleImport);
  const enhancedRealism = useUiStore((s) => s.enhancedRealism);
  const toggleEnhancedRealism = useUiStore((s) => s.toggleEnhancedRealism);
  const photoBusy = useUiStore((s) => s.photoBusy);
  const requestPhoto = useUiStore((s) => s.requestPhoto);
  const lightStudyOpen = useUiStore((s) => s.lightStudyOpen);
  const toggleLightStudy = useUiStore((s) => s.toggleLightStudy);
  const aiRelight = useLightStudyStatus();

  const seg = (active: boolean) =>
    `px-2.5 py-1 text-xs ${active ? 'bg-sky-500/25 text-sky-200' : 'text-white/60 hover:bg-white/10'}`;
  const btn = 'rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-30';

  return (
    <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2 rounded-xl bg-black/60 px-3 py-2 text-white shadow-lg backdrop-blur">
      <div className="flex overflow-hidden rounded-md border border-white/15" data-tour="mode-toggle">
        <button className={seg(mode === '3d')} onClick={() => setMode('3d')}>
          3D
        </button>
        <button className={seg(mode === 'plan')} onClick={() => setMode('plan')}>
          Plan
        </button>
      </div>
      <span className="font-sans text-sm font-semibold">{name}</span>
      <span className="text-white/25">·</span>
      <button className={btn} disabled={!canUndo} onClick={undo}>
        Undo
      </button>
      <button className={btn} disabled={!canRedo} onClick={redo}>
        Redo
      </button>
      {mode === '3d' && (
        <>
          <GizmoModeToggle />
          <button
            className={`${btn} inline-flex items-center gap-1`}
            onClick={() => edit((d) => d.furniture.forEach((f) => (f.rotationY += 15)))}
            title="Demo edit: rotate all furniture 15° — recorded as one undoable patch"
          >
            <RefreshCw size={13} /> Nudge
          </button>
          <button
            className={`rounded-md px-2 py-1 text-xs ${
              cutaway ? 'bg-sky-500/25 text-sky-200' : 'bg-white/10 text-white/50 hover:bg-white/20'
            }`}
            onClick={toggleCutaway}
            title="Fade walls facing the camera (dollhouse view)"
          >
            Cutaway {cutaway ? 'on' : 'off'}
          </button>
          <button
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
              lightingOpen ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-white/50 hover:bg-white/20'
            }`}
            onClick={toggleLighting}
            data-tour="light"
            title="Open lighting controls"
          >
            <Sun size={13} /> Light
          </button>
          <button
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
              materialsOpen ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-white/50 hover:bg-white/20'
            }`}
            onClick={toggleMaterials}
            title="Open wall/floor/ceiling materials"
          >
            <Palette size={13} /> Materials
          </button>
          <button
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
              enhancedRealism ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-white/50 hover:bg-white/20'
            }`}
            onClick={toggleEnhancedRealism}
            data-tour="realism"
            title="ON: apartment HDRI, fabric/wood materials, soft shadows, window light"
          >
            <Sparkles size={13} /> Realism
          </button>
          <button
            className={`${btn} inline-flex items-center gap-1`}
            disabled={photoBusy}
            onClick={requestPhoto}
            data-tour="capture"
            title="One-shot high-quality capture, every setting maxed"
          >
            <Camera size={13} /> {photoBusy ? 'Rendering…' : 'Capture'}
          </button>
          <button
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
              lightStudyOpen ? 'bg-amber-500/25 text-amber-200' : 'bg-white/10 text-white/50 hover:bg-white/20'
            }`}
            onClick={toggleLightStudy}
            data-tour="day"
            title={
              aiRelight.available
                ? `Render one frame per hour and scrub a whole day — then re-light any hour with AI${
                    aiRelight.mock ? ' (mock)' : ''
                  }`
                : 'Render one frame per hour and scrub the light across a whole day'
            }
          >
            <Clock size={13} /> Day
            {/* The AI pass lives two clicks inside this panel, so surface that it exists
                at all from the toolbar rather than only once you're already in there. */}
            {aiRelight.available && <Sparkles size={11} className="text-amber-300/90" />}
          </button>
        </>
      )}
      <span className="text-white/25">·</span>
      {roomPhotoEnabled && (
        <button className={`${btn} inline-flex items-center gap-1`} onClick={toggleImport} title="Generate a room from an uploaded photo">
          <Camera size={13} /> Import room
        </button>
      )}
      <DesignTransfer />
      <button
        className={`${btn} inline-flex items-center gap-1`}
        onClick={() => useUiStore.getState().setTourOpen(true)}
        title="Replay the guided tour"
      >
        <HelpCircle size={13} /> Tour
      </button>
      <button className={btn} onClick={reset} title="Discard changes and reload the sample scene">
        Reset
      </button>
      <span
        className={`rounded-md px-2 py-1 text-[11px] ${
          aiEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/40'
        }`}
      >
        AI {aiEnabled ? 'on' : 'off'}
      </span>
    </div>
  );
}

/** Switches what the 3D transform gizmo does with the selected furniture. Only meaningful
 * once something is selected, so it stays disabled (and says why) until then. */
function GizmoModeToggle() {
  const gizmoMode = useUiStore((s) => s.gizmoMode);
  const setGizmoMode = useUiStore((s) => s.setGizmoMode);
  const hasSelection = useUiStore((s) => s.selectedFurnitureId) !== null;

  const seg = (active: boolean) =>
    `inline-flex items-center gap-1 px-2 py-1 text-xs ${
      active ? 'bg-sky-500/25 text-sky-200' : 'text-white/50 hover:bg-white/10'
    } ${hasSelection ? '' : 'opacity-40'}`;

  return (
    <div
      className="flex overflow-hidden rounded-md bg-white/10"
      title={hasSelection ? 'What dragging the gizmo does' : 'Select a furniture item first'}
    >
      <button className={seg(gizmoMode === 'translate')} onClick={() => setGizmoMode('translate')}>
        <Move size={13} /> Move
      </button>
      <button className={seg(gizmoMode === 'rotate')} onClick={() => setGizmoMode('rotate')}>
        <RotateCw size={13} /> Turn
      </button>
    </div>
  );
}
