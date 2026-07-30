import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

// A comfortable indoor walking pace, not open-world running: the sample room is only
// ~5x4m, and 4 m/s (closer to a jog) crossed it in about a second during testing —
// fine for a big scene, uncontrollable for adjusting your viewpoint inside a small one.
const MOVE_SPEED = 1.8; // m/s, horizontal (WASD)
const VERTICAL_SPEED = 1.3; // m/s, Q/E
const KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e']);

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** Minimal shape of whatever's registered as R3F's "default" controls — drei's
 * OrbitControls exposes `target`, which is all this needs to stay in sync with it. */
interface HasTarget {
  target: THREE.Vector3;
}

function hasTarget(c: unknown): c is HasTarget {
  return !!c && typeof c === 'object' && 'target' in c && (c as HasTarget).target instanceof THREE.Vector3;
}

/**
 * WASD to walk (horizontal, camera-relative), Q/E to move straight up/down — on top of
 * OrbitControls' existing drag-to-look/scroll-to-zoom, not replacing it.
 *
 * The trick for coexisting with OrbitControls without a fight: every frame, shift BOTH
 * `camera.position` and `controls.target` by the identical delta. OrbitControls only
 * ever recomputes the camera from `target + storedOffset` on its own next update (a
 * user drag, or its damping loop) — since target and camera moved together, that offset
 * never changed, so its recompute lands exactly where this component left the camera.
 * Shifting only `camera.position` would work for one frame and then snap back the
 * instant OrbitControls next updates.
 */
export function FlyControls({ active }: { active: boolean }) {
  const { camera, controls, invalidate } = useThree();
  const held = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!KEYS.has(k) || isTypingTarget(e.target)) return;
      held.current.add(k);
      // The scene renders on demand, so the first frame of movement has to be asked for;
      // the useFrame below then keeps asking for as long as the key is down.
      invalidate();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.current.delete(e.key.toLowerCase());
    };
    const onBlur = () => held.current.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      held.current.clear();
    };
  }, [active, invalidate]);

  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const delta3 = useRef(new THREE.Vector3());

  useFrame((_, rawDt) => {
    const keys = held.current;
    if (!active || keys.size === 0) return;

    // A backgrounded/throttled tab can deliver one frame with a huge accumulated dt
    // (seconds, not milliseconds) once it resumes ticking. Uncapped, that turns into a
    // single teleport clear across the room instead of a smooth walk. Clamping to a
    // worst-case "slow frame" (~8fps) keeps movement bounded no matter how long the
    // gap between ticks was, at the cost of a brief pause rather than a jump.
    const dt = Math.min(rawDt, 1 / 8);

    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    if (forward.current.lengthSq() < 1e-8) forward.current.set(0, 0, -1);
    forward.current.normalize();
    // Camera-right in a Y-up right-handed frame: forward × up.
    right.current.set(-forward.current.z, 0, forward.current.x);

    delta3.current.set(0, 0, 0);
    if (keys.has('w')) delta3.current.add(forward.current);
    if (keys.has('s')) delta3.current.addScaledVector(forward.current, -1);
    if (keys.has('d')) delta3.current.add(right.current);
    if (keys.has('a')) delta3.current.addScaledVector(right.current, -1);
    if (delta3.current.lengthSq() > 1e-8) delta3.current.normalize().multiplyScalar(MOVE_SPEED * dt);

    if (keys.has('e')) delta3.current.y += VERTICAL_SPEED * dt;
    if (keys.has('q')) delta3.current.y -= VERTICAL_SPEED * dt;

    if (delta3.current.lengthSq() === 0) return;
    camera.position.add(delta3.current);
    if (hasTarget(controls)) controls.target.add(delta3.current);
    invalidate();
  });

  return null;
}
