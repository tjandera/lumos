import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, Sparkles, Loader2, Play, Pause, RefreshCw, Sun, Trash2, Download, Package } from 'lucide-react';
import { formatClock } from '@interior/core';
import { useUiStore } from '../uiStore';
import { useSceneStore } from '../store';
import {
  analyzeRoomPhoto,
  generateImageDayMoment,
  getImageDaySchedule,
  getImageDayStatus,
  type ImageDayMoment,
  type ImageDaySchedule,
  type ImageDaySite,
  type RoomLightContext,
} from '../api/client';
import { frameKey, readFrame, readRun, writeFrame, fingerprintPhoto } from './cache';
import { bytesFromDataUrl, createZip, downloadBlob, safeName } from './zip';

/** Frames are held at full size in memory; playback just swaps the src. */
const PLAYBACK_MS = 900;

interface Frame {
  momentId: string;
  label: string;
  minutes: number;
  imageDataUrl: string;
  /** Kept so the exported archive can describe the light in each shot. */
  altitudeDeg?: number;
  bearingDeg?: number | null;
}

/**
 * "Image Generation Day" — upload a photo of a real room, see it under the daylight that
 * room will actually get across a day.
 *
 * Separate from the Day light study on purpose. That one re-lights frames our own
 * renderer produced, where the geometry is already correct. This one starts from
 * somebody's photograph, so the room has to be *read* first (one vision pass) and then
 * preserved through every generated hour.
 *
 * The sun is not decorative: times and angles come from `dayMoments()` for this design's
 * location, orientation and date, so golden hour is that building's golden hour.
 */
export function ImageDayPanel() {
  const open = useUiStore((s) => s.imageDayOpen);
  const toggle = useUiStore((s) => s.toggleImageDay);
  const doc = useSceneStore((s) => s.doc);

  const [status, setStatus] = useState<{ available: boolean; mock: boolean; imageModel: string } | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ImageDaySchedule | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const contextRef = useRef<RoomLightContext | null>(null);
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const site: ImageDaySite = {
    lat: doc.site.lat,
    lng: doc.site.lng,
    trueNorthOffsetDeg: doc.site.trueNorthOffsetDeg ?? 0,
    date: new Date().toISOString().slice(0, 10),
  };

  useEffect(() => {
    if (!open) return;
    let live = true;
    getImageDayStatus()
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus({ available: false, mock: false, imageModel: '' }));
    // The schedule is free — no model runs — so show real times before anyone spends.
    getImageDaySchedule(site)
      .then((s) => live && setSchedule(s))
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc.site.lat, doc.site.lng, doc.site.trueNorthOffsetDeg]);

  // Restore a previous run for this exact photo + place + date.
  useEffect(() => {
    if (!photo || !schedule) return;
    const prefix = `${fingerprintPhoto(photo)}|${site.lat.toFixed(3)},${site.lng.toFixed(3)},${Math.round(
      site.trueNorthOffsetDeg,
    )}|${site.date}|`;
    readRun(prefix).then((cached) => {
      if (cached.length === 0) return;
      const order = schedule.moments.map((m) => m.id);
      setFrames(
        cached
          .map((c) => ({ momentId: c.momentId, label: c.label, minutes: c.minutes, imageDataUrl: c.imageDataUrl }))
          .sort((a, b) => order.indexOf(a.momentId) - order.indexOf(b.momentId)),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, schedule]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % frames.length), PLAYBACK_MS);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(String(reader.result));
      setFrames([]);
      setIndex(0);
      setError(null);
      contextRef.current = null;
    };
    reader.readAsDataURL(file);
  };

  /** Read the room once per photo, then reuse for every moment so they stay consistent. */
  const ensureContext = useCallback(async (src: string): Promise<RoomLightContext | undefined> => {
    if (contextRef.current) return contextRef.current;
    setBusy('Reading the room…');
    try {
      const { context } = await analyzeRoomPhoto(src);
      contextRef.current = context;
      return context;
    } catch {
      // Non-fatal: generation still works from the sun data alone, just less consistently.
      return undefined;
    }
  }, []);

  const runMoments = useCallback(
    async (ids: string[]) => {
      if (!photo) return;
      cancelRef.current = false;
      setError(null);
      setPlaying(false);
      setProgress({ done: 0, total: ids.length });

      const context = await ensureContext(photo);
      const collected: Frame[] = [];

      for (const [i, id] of ids.entries()) {
        if (cancelRef.current) break;
        const moment = schedule?.moments.find((m) => m.id === id);
        setBusy(`Generating ${moment?.label ?? id}…`);

        const key = frameKey({
          photo,
          lat: site.lat,
          lng: site.lng,
          northOffsetDeg: site.trueNorthOffsetDeg,
          dateIso: site.date,
          momentId: id,
        });

        try {
          const hit = await readFrame(key);
          const frame: Frame = hit
            ? { momentId: id, label: hit.label, minutes: hit.minutes, imageDataUrl: hit.imageDataUrl }
            : await generateImageDayMoment(photo, id, site, context).then((r) => ({
                momentId: r.moment.id,
                label: r.moment.label,
                minutes: r.moment.minutes,
                imageDataUrl: r.imageDataUrl,
                altitudeDeg: r.moment.altitudeDeg,
                bearingDeg: r.moment.bearingDeg,
              }));

          if (!hit) {
            void writeFrame({ key, ...frame, createdAt: Date.now() });
          }
          collected.push(frame);
          // Show each frame the moment it lands rather than making people wait for
          // the whole run — a six-image sequence is several minutes.
          setFrames((prev) => {
            const next = prev.filter((f) => f.momentId !== frame.momentId).concat(frame);
            const order = schedule?.moments.map((m) => m.id) ?? [];
            return next.sort((a, b) => order.indexOf(a.momentId) - order.indexOf(b.momentId));
          });
        } catch (err) {
          // One failed hour must not throw away the ones already paid for.
          setError(err instanceof Error ? err.message : 'Generation failed');
          break;
        }
        setProgress({ done: i + 1, total: ids.length });
      }

      setBusy(null);
      setProgress(null);
      if (collected.length > 1) setIndex(0);
    },
    [photo, schedule, ensureContext, site.lat, site.lng, site.trueNorthOffsetDeg, site.date],
  );

  /**
   * Everything generated so far, as one ZIP.
   *
   * Includes a manifest, because a folder of a dozen room photos is meaningless without
   * knowing which hour each one is and where the sun was — that context is the whole
   * point of the feature and would otherwise be lost the moment the files leave the app.
   * Exports whatever exists rather than requiring a complete run: a partial day is still
   * worth keeping, and it was still paid for.
   */
  const downloadAll = useCallback(() => {
    if (frames.length === 0) return;
    const stamp = `${site.date}`;
    const order = schedule?.moments.map((m) => m.id) ?? [];
    const ordered = [...frames].sort((a, b) => order.indexOf(a.momentId) - order.indexOf(b.momentId));

    const manifest = [
      'Image Generation Day',
      '',
      `Date          : ${stamp}`,
      `Location      : ${site.lat.toFixed(4)}, ${site.lng.toFixed(4)}`,
      `Room rotation : ${Math.round(site.trueNorthOffsetDeg)}° from true north`,
      schedule?.sunriseMinutes != null && schedule?.sunsetMinutes != null
        ? `Sunrise/sunset: ${formatClock(schedule.sunriseMinutes)} / ${formatClock(schedule.sunsetMinutes)} (local solar time)`
        : `Sky           : ${schedule?.kind === 'polarDay' ? 'midnight sun' : 'polar night'}`,
      `Model         : ${status?.imageModel ?? 'unknown'}${status?.mock ? ' (mock — images are echoes of the source)' : ''}`,
      '',
      `${ordered.length} of ${order.length} moments generated.`,
      '',
      'File                                  Time   Sun',
      '--------------------------------------------------------------',
      ...ordered.map((f, i) => {
        const name = `${String(i + 1).padStart(2, '0')}-${safeName(f.momentId)}.png`;
        // `bearingDeg` is null exactly when core considers the sun down, so keying off
        // it keeps this line agreeing with the image. Testing `altitude <= 0` instead
        // reported sunset as "below horizon (-0.0°)" while the prompt — correctly, since
        // refraction still shows the disc — had asked for a sun sitting on the horizon.
        const sun =
          f.altitudeDeg === undefined
            ? '—'
            : f.bearingDeg == null
              ? `below horizon (${f.altitudeDeg.toFixed(1)}°)`
              : `${Math.max(0, f.altitudeDeg).toFixed(0)}° up, bearing ${Math.round(f.bearingDeg)}°`;
        return `${name.padEnd(38)}${formatClock(f.minutes).padEnd(7)}${sun}`;
      }),
      '',
      'Times are local solar time. Sun bearing is relative to the room, clockwise.',
      'Images are AI-generated from a photograph; treat them as a guide, not a measurement.',
      '',
    ].join('\n');

    const zip = createZip([
      { name: 'README.txt', bytes: new TextEncoder().encode(manifest) },
      ...ordered.map((f, i) => ({
        // Numbered so a plain alphabetical file listing is still in time order.
        name: `${String(i + 1).padStart(2, '0')}-${safeName(f.momentId)}.png`,
        bytes: bytesFromDataUrl(f.imageDataUrl),
      })),
    ]);
    downloadBlob(zip, `room-day-${stamp}.zip`);
  }, [frames, schedule, site.date, site.lat, site.lng, site.trueNorthOffsetDeg, status]);

  if (!open) return null;

  const current = frames[Math.min(index, Math.max(0, frames.length - 1))];
  const allIds = schedule?.moments.map((m) => m.id) ?? [];
  const canRun = Boolean(photo) && !busy && status?.available;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4" onClick={toggle}>
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <div>
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
              <Sparkles size={14} className="text-violet-300" /> Image Generation Day
              {status?.mock && <span className="text-[10px] font-normal text-white/40">(mock)</span>}
            </h2>
            <p className="text-[11px] text-white/45">
              Upload a photo of your room and see it under the light it really gets across a day.
            </p>
          </div>
          <button className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white/90" onClick={toggle}>
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {!status?.available && (
            <div className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-[11px] leading-snug text-amber-100/70">
              This feature needs an image model. Set <code className="rounded bg-white/10 px-1">OPENAI_API_KEY</code>{' '}
              on the API, or <code className="rounded bg-white/10 px-1">IMAGE_DAY_MOCK=true</code> to click through
              the flow for free.
            </div>
          )}

          {!photo ? (
            <div className="py-10 text-center">
              <p className="mx-auto mb-4 max-w-lg text-sm leading-relaxed text-white/60">
                Take a photo of the room you're thinking about — ideally including a window — and this generates
                that same room at dawn, midday, golden hour and dusk, using the real sun for your location and
                today's date.
              </p>
              <button
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/85 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} /> Upload a room photo
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
              <p className="mt-3 text-[11px] text-white/30">
                The photo is sent to the image model to be re-lit. It isn't saved to your design or share links.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex gap-3">
                <img src={photo} alt="Your room" className="h-20 w-28 rounded object-cover ring-1 ring-white/15" />
                <div className="min-w-0 flex-1 text-[11px] text-white/50">
                  <p className="mb-1 text-white/70">
                    {doc.site.lat.toFixed(2)}°, {doc.site.lng.toFixed(2)}° · {site.date}
                    {schedule?.kind === 'polarDay' && ' · midnight sun'}
                    {schedule?.kind === 'polarNight' && ' · polar night'}
                  </p>
                  {schedule && schedule.sunriseMinutes !== null && schedule.sunsetMinutes !== null && (
                    <p>
                      Sunrise {formatClock(schedule.sunriseMinutes)} · sunset {formatClock(schedule.sunsetMinutes)}{' '}
                      (local solar time)
                    </p>
                  )}
                  <button
                    className="mt-1 inline-flex items-center gap-1 text-white/40 hover:text-white/70"
                    onClick={() => fileRef.current?.click()}
                  >
                    <RefreshCw size={11} /> Use a different photo
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                </div>
              </div>

              {/* Per-moment buttons: one image each, so someone can spend on just the
                  hour they care about instead of committing to the whole day. */}
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] text-white/45">Generate:</span>
                {schedule?.moments.map((m) => {
                  const have = frames.some((f) => f.momentId === m.id);
                  return (
                    <button
                      key={m.id}
                      disabled={!canRun}
                      onClick={() => runMoments([m.id])}
                      title={momentTooltip(m)}
                      className={`rounded px-1.5 py-1 text-[11px] disabled:opacity-40 ${
                        have ? 'bg-violet-500/25 text-violet-100' : 'bg-white/10 text-white/60 hover:bg-white/20'
                      }`}
                    >
                      {m.label} <span className="text-white/35">{formatClock(m.minutes)}</span>
                    </button>
                  );
                })}
                <button
                  disabled={!canRun}
                  onClick={() => runMoments(allIds)}
                  className="ml-auto inline-flex items-center gap-1 rounded-md bg-violet-500/85 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-40"
                  title={`All ${allIds.length} moments — roughly ${allIds.length * 35}s and ${allIds.length} image-model calls`}
                >
                  <Sun size={12} /> Full timelapse ({allIds.length})
                </button>
              </div>

              {busy && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-white/60">
                  <Loader2 size={13} className="animate-spin text-violet-300" />
                  <span>{busy}</span>
                  {progress && (
                    <span className="ml-auto font-mono text-white/40">
                      {progress.done}/{progress.total}
                    </span>
                  )}
                  <button
                    className="ml-2 rounded px-1.5 py-0.5 text-white/40 hover:bg-white/10 hover:text-white/80"
                    onClick={() => {
                      cancelRef.current = true;
                    }}
                  >
                    Stop
                  </button>
                </div>
              )}

              {error && (
                <p className="mb-3 rounded bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</p>
              )}

              {frames.length > 0 && current && (
                <>
                  <div className="relative flex max-h-[50vh] items-center justify-center overflow-hidden rounded-lg bg-black">
                    <img
                      src={current.imageDataUrl}
                      alt={`Room at ${current.label}`}
                      className="max-h-[50vh] w-auto max-w-full object-contain"
                    />
                    <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-violet-200">
                      AI generated{status?.mock ? ' (mock)' : ''} · {current.label} {formatClock(current.minutes)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      className="rounded-md bg-white/10 p-1.5 text-white/80 hover:bg-white/20 disabled:opacity-30"
                      disabled={frames.length < 2}
                      onClick={() => setPlaying(!playing)}
                      title={playing ? 'Pause' : 'Play the timelapse'}
                    >
                      {playing ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, frames.length - 1)}
                      step={1}
                      value={Math.min(index, frames.length - 1)}
                      onChange={(e) => {
                        setPlaying(false);
                        setIndex(Number(e.target.value));
                      }}
                      disabled={frames.length < 2}
                      className="h-1 flex-1 cursor-pointer accent-violet-400"
                    />
                    <span className="w-28 text-right text-[11px] text-white/60">{current.label}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-white/35">
                    <span>
                      {frames.length} of {allIds.length} moments · cached, so reopening is free
                    </span>
                    <div className="flex gap-2">
                      <button
                        className="inline-flex items-center gap-1 rounded bg-violet-500/20 px-2 py-1 text-violet-100 hover:bg-violet-500/30"
                        onClick={downloadAll}
                        title={`Download all ${frames.length} images as a ZIP, with a manifest of times and sun angles`}
                      >
                        <Package size={12} /> Download all ({frames.length})
                      </button>
                      <a
                        href={current.imageDataUrl}
                        download={`room-${current.momentId}.png`}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-white/55 hover:bg-white/10"
                      >
                        <Download size={12} /> This one
                      </a>
                      <button
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-white/55 hover:bg-white/10"
                        onClick={() => {
                          setFrames([]);
                          setIndex(0);
                        }}
                      >
                        <Trash2 size={12} /> Clear
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function momentTooltip(m: ImageDayMoment): string {
  if (m.afterDark) return `${m.label} — sun below the horizon, lamps take over`;
  return `${m.label} — sun ${Math.round(m.altitudeDeg)}° up${
    m.bearingDeg === null ? '' : `, bearing ${Math.round(m.bearingDeg)}°`
  }`;
}
