import { useEffect } from 'react';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** App-wide Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y (redo), and Delete/Backspace
 * (remove whatever's currently selected — furniture, a light fixture, or a Plan-mode
 * wall/opening). Disabled while focus is in a text field so typing "z" or deleting text
 * doesn't get hijacked. */
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
  }, [undo, redo, edit, selectedFurnitureId, selectLight, selectedLightId, selectFurniture, planSelection, setPlanSelection]);
}
