import { create } from 'zustand';

interface PerfState {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  set: (p: Partial<Omit<PerfState, 'set'>>) => void;
}

export const usePerf = create<PerfState>()((set) => ({
  fps: 0,
  frameMs: 0,
  calls: 0,
  triangles: 0,
  set: (p) => set(p),
}));
