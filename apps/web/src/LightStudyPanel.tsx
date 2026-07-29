import { useEffect } from 'react';
import { X, Play, Pause, Sun, RefreshCw, Loader2 } from 'lucide-react';
import { useUiStore } from './uiStore';
import { STUDY_FRAME_COUNT } from './LightStudy';

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** How long each frame is held when playing the day back. Slow enough to read the
 *  light, fast enough that a full day takes a few seconds. */
const PLAYBACK_MS = 140;

/**
 * A day of real renders you can scrub through.
 *
 * The sun position behind every frame is the physically-derived one for this room's
 * location, date and orientation, so this is a genuine light study rather than an
 * impression of one — and because the frames are already captured, dragging the slider
 * seeks instantly instead of re-rendering or buffering.
 */
export function LightStudyPanel() {
  const open = useUiStore((s) => s.lightStudyOpen);
  const toggle = useUiStore((s) => s.toggleLightStudy);
  const busy = useUiStore((s) => s.lightStudyBusy);
  const progress = useUiStore((s) => s.lightStudyProgress);
  const frames = useUiStore((s) => s.lightStudyFrames);
  const index = useUiStore((s) => s.lightStudyIndex);
  const setIndex = useUiStore((s) => s.setLightStudyIndex);
  const request = useUiStore((s) => s.requestLightStudy);
  const clear = useUiStore((s) => s.clearLightStudy);
  const mode = useUiStore((s) => s.mode);
  const playing = useUiStore((s) => s.lightStudyPlaying);
  const setPlaying = useUiStore((s) => s.setLightStudyPlaying);

  // Play the captured day back on a timer. Stops itself if the frames go away.
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const id = window.setInterval(() => {
      const s = useUiStore.getState();
      s.setLightStudyIndex((s.lightStudyIndex + 1) % s.lightStudyFrames.length);
    }, PLAYBACK_MS);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  useEffect(() => {
    if (frames.length === 0 && playing) setPlaying(false);
  }, [frames.length, playing, setPlaying]);

  if (!open) return null;

  const current = frames[Math.min(index, frames.length - 1)];

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4" onClick={toggle}>
      <div
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <div>
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
              <Sun size={14} className="text-amber-300" /> Light study
            </h2>
            <p className="text-[11px] text-white/45">
              One render per hour, lit by the real sun for this room’s location and date.
            </p>
          </div>
          <button className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white/90" onClick={toggle}>
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {busy ? (
            <div className="flex flex-col items-center gap-3 py-12 text-white/70">
              <Loader2 size={22} className="animate-spin text-amber-300" />
              <p className="text-sm">Rendering the day…</p>
              <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="font-mono text-[11px] text-white/40">
                {Math.round(progress * STUDY_FRAME_COUNT)} / {STUDY_FRAME_COUNT} hours
              </p>
            </div>
          ) : frames.length === 0 ? (
            <div className="py-10 text-center">
              <p className="mx-auto mb-4 max-w-md text-sm leading-relaxed text-white/60">
                Capture the room once an hour across a full day, then scrub through it to see exactly
                how the light moves — including the hours after sunset, where your lamps take over.
              </p>
              {mode === '3d' ? (
                <button
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/85 px-3 py-1.5 text-sm font-medium text-black hover:bg-amber-400"
                  onClick={request}
                >
                  <Sun size={14} /> Render the day
                </button>
              ) : (
                <p className="text-xs text-amber-200/80">Switch to the 3D view to render a light study.</p>
              )}
            </div>
          ) : (
            <>
              {/* Cap the height so the scrubber stays on screen: the canvas can be far
                  taller than it is wide, and a full-width image would push the controls
                  out of view entirely on a portrait window. */}
              <div className="flex max-h-[55vh] items-center justify-center overflow-hidden rounded-lg bg-black">
                {current && (
                  <img
                    src={current.dataUrl}
                    alt={`Room at ${clock(current.minutes)}`}
                    className="max-h-[55vh] w-auto max-w-full object-contain"
                  />
                )}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  className="rounded-md bg-white/10 p-1.5 text-white/80 hover:bg-white/20"
                  onClick={() => setPlaying(!playing)}
                  title={playing ? 'Pause' : 'Play the day'}
                >
                  {playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={frames.length - 1}
                  step={1}
                  value={Math.min(index, frames.length - 1)}
                  onChange={(e) => {
                    setPlaying(false);
                    setIndex(Number(e.target.value));
                  }}
                  className="h-1 flex-1 cursor-pointer accent-amber-400"
                />
                <span className="w-14 text-right font-mono text-sm text-white">
                  {current ? clock(current.minutes) : '—'}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-white/35">{frames.length} frames · drag to scrub</span>
                <div className="flex gap-2">
                  <button className="rounded-md px-2 py-1 text-xs text-white/55 hover:bg-white/10" onClick={clear}>
                    Discard
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/20"
                    onClick={request}
                    disabled={mode !== '3d'}
                    title={mode === '3d' ? 'Capture again' : 'Switch to 3D first'}
                  >
                    <RefreshCw size={12} /> Re-render
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
