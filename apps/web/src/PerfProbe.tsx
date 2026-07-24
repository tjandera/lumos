import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { usePerf } from './perf';

/**
 * Lives inside the Canvas. Samples frame time and the renderer's draw-call /
 * triangle counts a few times a second and pushes them to the perf store, which
 * the DOM HUD reads. Cheap, and it makes perf regressions visible from Phase 0.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const set = usePerf((s) => s.set);
  const acc = useRef({ frames: 0, time: 0, last: performance.now() });

  useFrame(() => {
    const now = performance.now();
    acc.current.time += now - acc.current.last;
    acc.current.last = now;
    acc.current.frames += 1;

    if (acc.current.time >= 250) {
      const { frames, time } = acc.current;
      set({
        fps: Math.round((frames * 1000) / time),
        frameMs: Math.round((time / frames) * 10) / 10,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      });
      acc.current.frames = 0;
      acc.current.time = 0;
    }
  });

  return null;
}
