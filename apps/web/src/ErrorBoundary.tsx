import { Component, type ErrorInfo, type ReactNode } from 'react';

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

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-neutral-900 p-6 text-center text-white">
          <div>
            <div className="mb-2 text-lg font-semibold">Something went wrong</div>
            <div className="max-w-md text-sm text-white/60">{this.state.error.message}</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
