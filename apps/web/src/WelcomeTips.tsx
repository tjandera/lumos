import { useState } from 'react';
import { X } from 'lucide-react';

const KEY = 'interior:welcomeTipsSeen';

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

const TIPS = [
  'Drag to orbit · scroll to zoom',
  'Click furniture to select it',
  'R rotates · Ctrl+D duplicates · Delete removes',
  'C toggles cutaway · L opens lighting',
  'Space plays the sun across the day',
  'Press 1 / 2 to jump between 3D and Plan',
];

/** A one-time, self-dismissing card of the shortcuts/gestures that make this app fast to
 * use — shown once per browser (localStorage-gated) so it never nags a returning user. */
export function WelcomeTips() {
  const [dismissed, setDismissed] = useState(alreadySeen());

  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div className="absolute left-1/2 top-20 z-10 w-full max-w-sm -translate-x-1/2 rounded-xl bg-black/80 p-3 text-sm text-white shadow-lg backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Welcome to Marina Studio</span>
        <button className="text-white/40 hover:text-white/70" onClick={dismiss}>
          <X size={14} />
        </button>
      </div>
      <ul className="space-y-0.5 text-[12px] text-white/70">
        {TIPS.map((tip) => (
          <li key={tip}>· {tip}</li>
        ))}
      </ul>
      <button className="mt-2 w-full rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20" onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
