import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureError } from "./telemetry";

interface ErrorBoundaryProps {
  /** Rendered instead of children after a crash. */
  fallback: ReactNode | ((reset: () => void) => ReactNode);
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Scopes a crash to the subtree it wraps (intended use: the 3D tab content
 * only) so the rest of the app — notably the 2D plan editor — stays usable
 * if the 3D canvas throws.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    captureError(error, { source: "react-error-boundary", componentStack: info.componentStack });
  }

  reset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return typeof this.props.fallback === "function" ? this.props.fallback(this.reset) : this.props.fallback;
    }
    return this.props.children;
  }
}
