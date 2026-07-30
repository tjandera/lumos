import { useEffect, useState } from 'react';
import { getLightStudyStatus, type LightStudyStatus } from './api/client';

/**
 * Whether the server can run the photoreal re-lighting pass, shared across components.
 *
 * Cached at module scope and fetched at most once per page load: the toolbar and the
 * light-study panel both want this, it never changes while the app is open, and the
 * status endpoint shouldn't be hit twice just because two components care.
 *
 * Failure is not an error state here — the API being absent simply means the styling
 * pass is unavailable, and the locally-rendered day cycle works regardless.
 */
let cached: LightStudyStatus | null = null;
let inFlight: Promise<LightStudyStatus> | null = null;

const UNAVAILABLE: LightStudyStatus = { available: false, mock: false, presets: [] };

function load(): Promise<LightStudyStatus> {
  if (cached) return Promise.resolve(cached);
  inFlight ??= getLightStudyStatus()
    .then((s) => (cached = s))
    .catch(() => {
      // Leave `cached` unset so a later mount can retry a transient failure, but
      // resolve rather than reject — no caller has anything useful to do with the error.
      inFlight = null;
      return UNAVAILABLE;
    });
  return inFlight;
}

export function useLightStudyStatus(): LightStudyStatus {
  const [status, setStatus] = useState<LightStudyStatus>(cached ?? UNAVAILABLE);

  useEffect(() => {
    let live = true;
    load().then((s) => {
      if (live) setStatus(s);
    });
    return () => {
      live = false;
    };
  }, []);

  return status;
}

/** Test-only: drop the module-scope cache between cases. */
export function resetLightStudyStatusCache(): void {
  cached = null;
  inFlight = null;
}
