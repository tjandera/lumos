import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useUiStore, type LightStudyFrame } from './uiStore';

/** Hourly samples across one full day. Night frames are worth keeping: with `auto`
 *  fixtures they're where the lamps take over, which is half the point of the study. */
export const STUDY_STEP_MINUTES = 60;
export const STUDY_FRAME_COUNT = Math.round((24 * 60) / STUDY_STEP_MINUTES);

/**
 * Frames to let the scene settle after moving the sun, before grabbing the canvas.
 * Sun direction and colour are derived immediately from `timeMinutes`, but the shadow
 * map, contact shadows and the bloom composer all need a pass or two to catch up —
 * capturing too early yields a frame lit by the *previous* hour's sun.
 */
const SETTLE_FRAMES = 6;

/**
 * Renders one real frame per hour of the day and stores them for the slider.
 *
 * This is deliberately the actual renderer rather than anything generative: the sun
 * position for the room's latitude, longitude, date and north offset is already
 * physically correct (see `sunVector` in core), so a captured stack *is* the accurate
 * light study. It also costs nothing per run and seeks instantly, which a generated
 * video would not.
 *
 * Capture runs entirely inside `useFrame` at default priority, mirroring PhotoCapture:
 * that reads the previously rendered frame, which is exactly what we want once the
 * scene has settled, and avoids taking over R3F's render loop (any positive priority
 * would disable automatic rendering and break the view when Realism is off).
 */
export function LightStudyCapture({ active }: { active: boolean }) {
  const gl = useThree((s) => s.gl);
  const running = useRef(false);
  const step = useRef(0);
  const settle = useRef(0);
  const frames = useRef<LightStudyFrame[]>([]);
  /** Scene state to put back when the run ends — the study must not leave the user's
   *  time of day, sun mode or playback where the capture happened to stop. */
  const prior = useRef<{ timeMinutes: number; sunMode: 'auto' | 'manual'; playing: boolean } | null>(null);

  const restore = () => {
    const s = useUiStore.getState();
    if (prior.current) {
      s.setTimeMinutes(prior.current.timeMinutes);
      s.setSunMode(prior.current.sunMode);
      s.setPlaying(prior.current.playing);
    }
    prior.current = null;
    running.current = false;
    frames.current = [];
  };

  useFrame(() => {
    const s = useUiStore.getState();

    // Leaving the 3D view mid-run would capture nothing useful; abandon and restore.
    if (running.current && !active) {
      restore();
      useUiStore.setState({ lightStudyRequested: false, lightStudyBusy: false, lightStudyProgress: 0 });
      return;
    }

    if (s.lightStudyRequested && !running.current) {
      running.current = true;
      step.current = 0;
      settle.current = SETTLE_FRAMES;
      frames.current = [];
      prior.current = { timeMinutes: s.timeMinutes, sunMode: s.sunMode, playing: s.playing };
      // The study sweeps `timeMinutes`, which only drives the sun in auto mode, and a
      // running sun animation would fight it for the same value.
      s.setSunMode('auto');
      s.setPlaying(false);
      s.setTimeMinutes(0);
      useUiStore.setState({ lightStudyRequested: false });
      return;
    }

    if (!running.current) return;

    if (settle.current > 0) {
      settle.current -= 1;
      return;
    }

    const minutes = step.current * STUDY_STEP_MINUTES;
    try {
      // JPEG rather than PNG: 24 full-resolution PNGs is tens of megabytes held in
      // memory for a panel that displays them at a fraction of that size.
      frames.current.push({ minutes, dataUrl: gl.domElement.toDataURL('image/jpeg', 0.82) });
    } catch (err) {
      console.warn('[light-study] capture failed', err);
      restore();
      useUiStore.setState({ lightStudyBusy: false, lightStudyProgress: 0 });
      return;
    }

    step.current += 1;
    if (step.current >= STUDY_FRAME_COUNT) {
      const captured = frames.current;
      restore();
      useUiStore.getState().finishLightStudy(captured);
      return;
    }

    useUiStore.getState().setLightStudyProgress(step.current / STUDY_FRAME_COUNT);
    useUiStore.getState().setTimeMinutes(step.current * STUDY_STEP_MINUTES);
    settle.current = SETTLE_FRAMES;
  });

  return null;
}
