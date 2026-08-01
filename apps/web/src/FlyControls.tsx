import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

// Comfortable indoor pace for a ~5×4m room. Shift holds a brisker walk.
const MOVE_SPEED = 2.2; // m/s
const SPRINT_MULT = 1.85;
const VERTICAL_SPEED = 1.4; // m/s, Q/E
const MIN_Y = 0.35;
const MAX_Y = 6.5;
const KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

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
 * WASD / arrows to walk (horizontal, camera-relative), Q/E up/down, Shift to move
 * faster — on top of OrbitControls' drag-to-look / scroll-to-zoom.
 *
 * Every frame, shift BOTH `camera.position` and `controls.target` by the same delta
 * so OrbitControls doesn't snap the camera back on its next update.
 */
export function FlyControls({ active }: { active: boolean }) {
  const { camera, controls, invalidate } = useThree();
  const held = useRef<Set<string>>(new Set());
  const sprint = useRef(false);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'shift') {
        sprint.current = true;
        return;
      }
      if (!KEYS.has(k) || isTypingTarget(e.target)) return;
      // Prevent arrow keys from scrolling the page while navigating the room.
      if (k.startsWith('arrow')) e.preventDefault();
      held.current.add(k);
      invalidate();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'shift') {
        sprint.current = false;
        return;
      }
      held.current.delete(k);
    };
    const onBlur = () => {
      held.current.clear();
      sprint.current = false;
    };
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

    const dt = Math.min(rawDt, 1 / 8);
    const speed = MOVE_SPEED * (sprint.current ? SPRINT_MULT : 1) * dt;

    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    if (forward.current.lengthSq() < 1e-8) forward.current.set(0, 0, -1);
    forward.current.normalize();
    right.current.set(-forward.current.z, 0, forward.current.x);

    delta3.current.set(0, 0, 0);
    if (keys.has('w') || keys.has('arrowup')) delta3.current.add(forward.current);
    if (keys.has('s') || keys.has('arrowdown')) delta3.current.addScaledVector(forward.current, -1);
    if (keys.has('d') || keys.has('arrowright')) delta3.current.add(right.current);
    if (keys.has('a') || keys.has('arrowleft')) delta3.current.addScaledVector(right.current, -1);
    if (delta3.current.lengthSq() > 1e-8) delta3.current.normalize().multiplyScalar(speed);

    if (keys.has('e')) delta3.current.y += VERTICAL_SPEED * dt;
    if (keys.has('q')) delta3.current.y -= VERTICAL_SPEED * dt;

    if (delta3.current.lengthSq() === 0) return;

    const nextY = THREE.MathUtils.clamp(camera.position.y + delta3.current.y, MIN_Y, MAX_Y);
    delta3.current.y = nextY - camera.position.y;

    camera.position.add(delta3.current);
    if (hasTarget(controls)) controls.target.add(delta3.current);
    invalidate();
  });

  return null;
}
