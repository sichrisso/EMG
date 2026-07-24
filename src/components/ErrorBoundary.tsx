import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

/**
 * Top-level error boundary. Catches render-phase errors and offers a
 * reload instead of a blank screen. Wire an error reporter (e.g. Sentry)
 * inside componentDidCatch when a DSN is configured.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Replace with an error-reporting call once monitoring is set up.
    console.error('Unhandled render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-cloud px-6 text-center">
          <p className="text-lg font-bold text-ink">Something went wrong.</p>
          <p className="mt-1 text-sm text-ink-muted">
            Reloading usually fixes it. If it keeps happening, please let us know.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-xl bg-navy px-6 py-2.5 text-sm font-bold text-white hover:bg-navy-soft"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
