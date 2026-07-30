import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X, Sparkles } from 'lucide-react';
import { useUiStore } from '../uiStore';
import { markTourSeen, placeCard, TOUR_STEPS, visibleSteps, type TourStep } from './steps';

const CARD_W = 320;

const query = (target: string) => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);

/**
 * A guided first-run walkthrough that points at the real controls.
 *
 * Targets are found by `data-tour` attribute and measured live, so the highlight follows
 * the UI rather than drifting from hard-coded positions. Steps whose target isn't on
 * screen are dropped up front — the AI panel is feature-flagged and the toolbar wraps on
 * narrow windows, so absence is normal.
 *
 * The overlay never blocks the app: the dimming layer is click-through, and only the
 * card itself takes pointer events. Someone who wants to start dragging furniture
 * mid-tour can just do it.
 */
export function Tour() {
  const open = useUiStore((s) => s.tourOpen);
  const setOpen = useUiStore((s) => s.setTourOpen);
  const setMode = useUiStore((s) => s.setMode);

  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Resolve which steps apply when the tour opens. The 3D view is where nearly every
  // control lives, so make sure we're there before measuring anything.
  useEffect(() => {
    if (!open) return;
    setMode('3d');
    const id = window.setTimeout(() => {
      setSteps(visibleSteps(TOUR_STEPS, (t) => Boolean(query(t))));
      setIndex(0);
    }, 60);
    return () => window.clearTimeout(id);
  }, [open, setMode]);

  const step = steps[index];

  const finish = useCallback(() => {
    markTourSeen();
    setOpen(false);
  }, [setOpen]);

  // Measure the target after layout, and keep it correct through scroll/resize.
  useLayoutEffect(() => {
    if (!open || !step) return;
    const measure = () => {
      const el = step.target ? query(step.target) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    const h = cardRef.current?.offsetHeight ?? 170;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (!rect) {
      setPos({ top: viewport.height / 2 - h / 2, left: viewport.width / 2 - CARD_W / 2 });
      return;
    }
    const p = placeCard(
      { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      { width: CARD_W, height: h },
      viewport,
      step.side ?? 'bottom',
    );
    setPos({ top: p.top, left: p.left });
  }, [open, step, rect]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1 < steps.length ? i + 1 : (finish(), i)));
  }, [steps.length, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, back, finish]);

  if (!open || !step || !pos) return null;

  const isLast = index === steps.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Dimming + a cut-out ring around the target. Click-through by design. */}
      <div className="absolute inset-0 bg-black/45 transition-opacity" />
      {rect && (
        <div
          className="absolute rounded-lg ring-2 ring-sky-300"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }}
        />
      )}

      <div
        ref={cardRef}
        className="pointer-events-auto absolute rounded-xl bg-neutral-900 p-4 shadow-2xl ring-1 ring-white/10"
        style={{ top: pos.top, left: pos.left, width: CARD_W }}
        role="dialog"
        aria-label="Product tour"
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
            {index === 0 && <Sparkles size={14} className="text-amber-300" />}
            {step.title}
          </h3>
          <button
            className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white/80"
            onClick={finish}
            aria-label="Skip tour"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-xs leading-relaxed text-white/65">{step.body}</p>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-sky-300' : 'bg-white/20'}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button className="rounded-md px-2 py-1 text-[11px] text-white/45 hover:bg-white/10" onClick={finish}>
              Skip
            </button>
            {index > 0 && (
              <button
                className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/20"
                onClick={back}
              >
                <ArrowLeft size={12} /> Back
              </button>
            )}
            <button
              className="inline-flex items-center gap-1 rounded-md bg-sky-500/85 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
              onClick={next}
            >
              {isLast ? 'Get started' : 'Next'} {!isLast && <ArrowRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
