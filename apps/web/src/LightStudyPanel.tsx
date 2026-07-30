import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Play, Pause, Sun, RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { useUiStore } from './uiStore';
import { STUDY_FRAME_COUNT } from './LightStudy';
import { getLightStudyStatus, relightFrame, type LightPresetInfo } from './api/client';

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** How long each frame is held when playing the day back. Slow enough to read the
 *  light, fast enough that a full day takes a few seconds. */
const PLAYBACK_MS = 140;

const presetChip = (active: boolean) =>
  `rounded px-1.5 py-0.5 text-[10px] disabled:opacity-40 ${
    active ? 'bg-amber-500/30 text-amber-100' : 'bg-white/10 text-white/60 hover:bg-white/20'
  }`;

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

  // --- Optional photoreal pass -------------------------------------------------
  const [presets, setPresets] = useState<LightPresetInfo[]>([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiMock, setAiMock] = useState(false);
  const [relighting, setRelighting] = useState<string | null>(null);
  const [relitError, setRelitError] = useState<string | null>(null);
  /** Cache keyed `${frameIndex}:${preset}` — re-lighting is metered, so never pay
   *  twice for the same frame/mood, and flipping between them stays instant. */
  const relitCache = useRef<Map<string, string>>(new Map());
  const [shownPreset, setShownPreset] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getLightStudyStatus()
      .then((s) => {
        if (cancelled) return;
        setAiAvailable(s.available);
        setAiMock(s.mock);
        setPresets(s.presets);
      })
      // The API being down or absent is not an error here — the day cycle above it is
      // rendered locally and works regardless.
      .catch(() => {
        if (!cancelled) setAiAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Moving to another hour invalidates what's on screen, not the cache.
  useEffect(() => {
    setShownPreset(null);
    setRelitError(null);
  }, [index]);

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

  const safeIndex = Math.min(index, Math.max(0, frames.length - 1));
  const current = frames[safeIndex];

  const applyPreset = useCallback(
    async (presetId: string) => {
      const frame = useUiStore.getState().lightStudyFrames[safeIndex];
      if (!frame) return;
      const key = `${safeIndex}:${presetId}`;
      if (relitCache.current.has(key)) {
        setShownPreset(presetId);
        setRelitError(null);
        return;
      }
      setRelighting(presetId);
      setRelitError(null);
      try {
        const { imageDataUrl } = await relightFrame(frame.dataUrl, presetId);
        relitCache.current.set(key, imageDataUrl);
        setShownPreset(presetId);
      } catch (err) {
        setRelitError(err instanceof Error ? err.message : 'Re-lighting failed');
      } finally {
        setRelighting(null);
      }
    },
    [safeIndex],
  );

  if (!open) return null;

  const relitSrc = shownPreset ? relitCache.current.get(`${safeIndex}:${shownPreset}`) : undefined;
  const displaySrc = relitSrc ?? current?.dataUrl;

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
              <div className="relative flex max-h-[55vh] items-center justify-center overflow-hidden rounded-lg bg-black">
                {current && (
                  <img
                    src={displaySrc}
                    alt={`Room at ${clock(current.minutes)}`}
                    className="max-h-[55vh] w-auto max-w-full object-contain"
                  />
                )}
                {relitSrc && (
                  <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-amber-200">
                    AI re-lit{aiMock ? ' (mock)' : ''} · {presets.find((p) => p.id === shownPreset)?.label ?? shownPreset}
                  </span>
                )}
                {relighting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                    <Loader2 size={20} className="animate-spin text-amber-300" />
                  </div>
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

              {/* Shown whether or not a key is configured: hiding it entirely made the
                  feature undiscoverable, so an unconfigured server explains itself
                  instead of silently offering nothing. */}
              <div className="mt-3 border-t border-white/10 pt-2">
                {aiAvailable ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <Sparkles size={12} className="mr-0.5 text-amber-300" />
                    <span className="mr-1 text-[11px] text-white/45">Photoreal pass:</span>
                    <button
                      className={presetChip(shownPreset === null)}
                      onClick={() => setShownPreset(null)}
                      disabled={!!relighting}
                    >
                      Render
                    </button>
                    {presets.map((p) => (
                      <button
                        key={p.id}
                        className={presetChip(shownPreset === p.id)}
                        onClick={() => applyPreset(p.id)}
                        disabled={!!relighting}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5">
                    <Sparkles size={12} className="mt-0.5 shrink-0 text-white/30" />
                    <p className="text-[11px] leading-snug text-white/40">
                      <span className="text-white/60">Photoreal re-lighting is available with an OpenAI key.</span>{' '}
                      Set <code className="rounded bg-white/10 px-1">OPENAI_API_KEY</code> on the API (or{' '}
                      <code className="rounded bg-white/10 px-1">LIGHT_STUDY_MOCK=true</code> to try the flow for
                      free) and reopen this panel. The day cycle above needs none of it.
                    </p>
                  </div>
                )}
                {aiAvailable && (
                  <p className="mt-1 text-[10px] leading-snug text-white/30">
                    Restyles this frame only — the day cycle above is the physically-accurate one.
                    The model can drift from your exact furniture; treat it as a mood image.
                  </p>
                )}
                {relitError && <p className="mt-1 text-[11px] text-red-300">{relitError}</p>}
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
