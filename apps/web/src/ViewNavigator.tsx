import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { documentWorldBounds } from '@interior/renderer';
import { useSceneStore } from './store';
import { useUiStore } from './uiStore';

interface HasTarget {
  target: THREE.Vector3;
  update?: () => void;
}

function hasTarget(c: unknown): c is HasTarget {
  return !!c && typeof c === 'object' && 'target' in c && (c as HasTarget).target instanceof THREE.Vector3;
}

/**
 * Responds to toolbar "Fit" / "Walk" requests by framing the room or dropping the
 * camera to eye level inside it — without fighting OrbitControls (moves camera + target).
 */
export function ViewNavigator({ active }: { active: boolean }) {
  const { camera, controls, invalidate } = useThree();
  const doc = useSceneStore((s) => s.doc);
  const fitViewNonce = useUiStore((s) => s.fitViewNonce);
  const walkViewNonce = useUiStore((s) => s.walkViewNonce);
  const lastFit = useRef(0);
  const lastWalk = useRef(0);

  useEffect(() => {
    if (!active || fitViewNonce === lastFit.current) return;
    lastFit.current = fitViewNonce;
    const bounds = documentWorldBounds(doc);
    if (!bounds) return;

    const cx = (bounds.min.x + bounds.max.x) / 2;
    const cy = Math.max(1.2, (bounds.min.y + bounds.max.y) / 2);
    const cz = (bounds.min.z + bounds.max.z) / 2;
    const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, 4);
    const dist = span * 1.15;

    camera.position.set(cx + dist * 0.72, cy + dist * 0.55, cz + dist * 0.72);
    if (hasTarget(controls)) {
      controls.target.set(cx, Math.min(1.2, cy * 0.55), cz);
      controls.update?.();
    }
    camera.lookAt(cx, 1.0, cz);
    invalidate();
  }, [active, fitViewNonce, doc, camera, controls, invalidate]);

  useEffect(() => {
    if (!active || walkViewNonce === lastWalk.current) return;
    lastWalk.current = walkViewNonce;
    const bounds = documentWorldBounds(doc);
    if (!bounds) return;

    const cx = (bounds.min.x + bounds.max.x) / 2;
    const cz = (bounds.min.z + bounds.max.z) / 2;
    const eye = 1.55;
    // Stand just inside the room, looking toward center.
    const px = bounds.min.x + 0.9;
    const pz = bounds.min.z + 0.9;

    camera.position.set(px, eye, pz);
    if (hasTarget(controls)) {
      controls.target.set(cx, eye, cz);
      controls.update?.();
    }
    camera.lookAt(cx, eye, cz);
    invalidate();
  }, [active, walkViewNonce, doc, camera, controls, invalidate]);

  return null;
}
