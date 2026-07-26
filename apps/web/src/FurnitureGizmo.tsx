import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';

const GRID = 0.1; // snap resolution (meters) — matches the Plan editor
const ROTATE_STEP_DEG = 15;

/**
 * Move/rotate the selected furniture directly in the 3D view, as an alternative to the
 * 2D plan editor.
 *
 * The renderer owns the furniture objects, so rather than plumbing refs out of it we look
 * the object up by the stable `furniture:<id>` name `SceneView` assigns. The gizmo drags
 * that object's transform live (so it tracks the pointer smoothly), and only on
 * mouse-up do we write back to the document — one `edit()` call, so a drag is a single
 * undo step, exactly like a plan-editor drag.
 */
export function FurnitureGizmo() {
  const scene = useThree((s) => s.scene);
  const doc = useSceneStore((s) => s.doc);
  const edit = useSceneStore((s) => s.edit);
  const selectedId = useUiStore((s) => s.selectedFurnitureId);
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const mode = useUiStore((s) => s.gizmoMode);

  const controlsRef = useRef<React.ComponentRef<typeof TransformControls> | null>(null);
  const [target, setTarget] = useState<THREE.Object3D | null>(null);

  // Resolve the selected id to its scene object. Depends on `doc` too: the object is
  // (re)created when furniture is added/removed, so a stale ref would silently detach.
  useEffect(() => {
    if (!selectedId) {
      setTarget(null);
      return;
    }
    setTarget(scene.getObjectByName(`furniture:${selectedId}`) ?? null);
  }, [scene, selectedId, doc]);

  // Commit on drag end. TransformControls mutates the object directly; we read the final
  // transform back off it and fold it into the document as one undoable patch.
  useEffect(() => {
    const controls = controlsRef.current as unknown as THREE.EventDispatcher<{
      'dragging-changed': { value: boolean };
    }> | null;
    if (!controls || !target || !selectedId) return;

    const onDraggingChanged = (e: { value: boolean }) => {
      if (e.value) return; // drag started — nothing to commit yet
      const snapVal = (v: number) =>
        snapEnabled ? Math.round(v / GRID) * GRID : Math.round(v * 1000) / 1000;
      const x = snapVal(target.position.x);
      const z = snapVal(target.position.z);
      // Keep furniture on the floor: the gizmo is XZ-only for translate, but guard anyway.
      const y = 0;
      const rotationY = ((Math.round((target.rotation.y * 180) / Math.PI) % 360) + 360) % 360;

      edit((d) => {
        const f = d.furniture.find((it) => it.id === selectedId);
        if (!f) return;
        f.position = { x, y, z };
        f.rotationY = rotationY;
      });
    };

    controls.addEventListener('dragging-changed', onDraggingChanged);
    return () => controls.removeEventListener('dragging-changed', onDraggingChanged);
  }, [target, selectedId, snapEnabled, edit]);

  if (!target) return null;

  return (
    <TransformControls
      ref={controlsRef}
      object={target}
      mode={mode}
      // Furniture sits on the floor and stands upright: translate in the ground plane,
      // rotate about the vertical axis. Lifting or tipping an item isn't a thing here.
      showY={mode === 'rotate'}
      showX={mode === 'translate'}
      showZ={mode === 'translate'}
      translationSnap={snapEnabled ? GRID : null}
      rotationSnap={snapEnabled ? (ROTATE_STEP_DEG * Math.PI) / 180 : null}
      size={0.8}
    />
  );
}
