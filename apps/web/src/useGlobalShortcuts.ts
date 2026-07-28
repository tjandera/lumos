import { useEffect } from 'react';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** App-wide keyboard shortcuts. Disabled while focus is in a text field so typing
 * doesn't get hijacked.
 *
 * - Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y (redo)
 * - Delete/Backspace: remove whatever's selected (furniture, a light fixture, or a
 *   Plan-mode wall/opening)
 * - R: rotate the selected furniture 15°
 * - Ctrl/Cmd+D: duplicate the selected furniture, offset slightly, and select the copy
 * - Escape: clear every selection
 * - Space: play/pause the time-of-day sweep
 * - 1 / 2: jump to the 3D / Plan tab
 * - C: toggle cutaway (dollhouse walls)
 * - L: toggle the Lighting panel
 */
export function useGlobalShortcuts(): void {
  const undo = useSceneStore((s) => s.undo);
  const redo = useSceneStore((s) => s.redo);
  const edit = useSceneStore((s) => s.edit);
  const selectedFurnitureId = useUiStore((s) => s.selectedFurnitureId);
  const selectFurniture = useUiStore((s) => s.selectFurniture);
  const selectedLightId = useUiStore((s) => s.selectedLightId);
  const selectLight = useUiStore((s) => s.selectLight);
  const planSelection = useUiStore((s) => s.planSelection);
  const setPlanSelection = useUiStore((s) => s.setPlanSelection);
  const togglePlaying = useUiStore((s) => s.togglePlaying);
  const setMode = useUiStore((s) => s.setMode);
  const toggleCutaway = useUiStore((s) => s.toggleCutaway);
  const toggleLighting = useUiStore((s) => s.toggleLighting);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (mod && e.key.toLowerCase() === 'd') {
        if (!selectedFurnitureId) return;
        e.preventDefault();
        const sourceId = selectedFurnitureId;
        const newId = crypto.randomUUID();
        edit((d) => {
          const f = d.furniture.find((x) => x.id === sourceId);
          if (!f) return;
          d.furniture.push({
            ...f,
            id: newId,
            position: { x: f.position.x + 0.25, y: f.position.y, z: f.position.z + 0.25 },
          });
        });
        selectFurniture(newId);
        return;
      }

      if (!mod && e.key.toLowerCase() === 'r') {
        if (!selectedFurnitureId) return;
        e.preventDefault();
        const id = selectedFurnitureId;
        edit((d) => {
          const f = d.furniture.find((x) => x.id === id);
          if (f) f.rotationY = ((f.rotationY + 15) % 360 + 360) % 360;
        });
        return;
      }

      if (e.key === 'Escape') {
        selectFurniture(null);
        selectLight(null);
        setPlanSelection(null);
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlaying();
        return;
      }

      if (e.key === '1') {
        setMode('3d');
        return;
      }
      if (e.key === '2') {
        setMode('plan');
        return;
      }
      if (!mod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        toggleCutaway();
        return;
      }
      if (!mod && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleLighting();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedFurnitureId) {
          e.preventDefault();
          const id = selectedFurnitureId;
          edit((d) => {
            d.furniture = d.furniture.filter((f) => f.id !== id);
          });
          selectFurniture(null);
        } else if (selectedLightId) {
          e.preventDefault();
          const id = selectedLightId;
          edit((d) => {
            d.lights = d.lights.filter((l) => l.id !== id);
          });
          selectLight(null);
        } else if (planSelection?.type === 'wall') {
          e.preventDefault();
          const id = planSelection.id;
          edit((d) => {
            for (const room of d.rooms) room.walls = room.walls.filter((w) => w.id !== id);
            d.openings = d.openings.filter((o) => o.wallId !== id);
          });
          setPlanSelection(null);
        } else if (planSelection?.type === 'opening') {
          e.preventDefault();
          const id = planSelection.id;
          edit((d) => {
            d.openings = d.openings.filter((o) => o.id !== id);
          });
          setPlanSelection(null);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    undo,
    redo,
    edit,
    selectedFurnitureId,
    selectLight,
    selectedLightId,
    selectFurniture,
    planSelection,
    setPlanSelection,
    togglePlaying,
    setMode,
    toggleCutaway,
    toggleLighting,
  ]);
}
