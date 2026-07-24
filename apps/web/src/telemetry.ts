/**
 * Minimal client error telemetry. Surfaces uncaught errors and promise rejections so
 * they're visible from Phase 1 rather than discovered late. A real backend (Sentry,
 * etc.) plugs in at these two call sites.
 */
export function initTelemetry(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (e) => {
    console.error('[telemetry] uncaught error', e.message, `${e.filename}:${e.lineno}`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    console.error('[telemetry] unhandled rejection', e.reason);
  });
}
