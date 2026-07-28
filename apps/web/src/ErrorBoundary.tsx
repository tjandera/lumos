import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearScene } from './persistence';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches render errors and shows a fallback instead of a white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] render error', error, info.componentStack);
  }

  private reload = (): void => {
    window.location.reload();
  };

  /** Wipe the persisted design (often the source of a bad document) and reload clean. */
  private resetShowcase = (): void => {
    clearScene();
    try {
      localStorage.removeItem('interior:welcomeTipsSeen');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-neutral-900 p-6 text-center text-white">
          <div>
            <div className="mb-2 text-lg font-semibold">Something went wrong</div>
            <div className="max-w-md text-sm text-white/60">{this.state.error.message}</div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                className="rounded bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20"
                onClick={this.reload}
              >
                Reload
              </button>
              <button
                className="rounded bg-emerald-500/20 px-4 py-1.5 text-sm text-emerald-200 hover:bg-emerald-500/30"
                onClick={this.resetShowcase}
              >
                Reset to Marina Studio
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
