import { Component, type ErrorInfo, type ReactNode } from 'react';

// Catches errors thrown while a bench loads or renders (e.g. a lazy bench whose
// vendored modules are missing) so one broken bench can't take down the whole app.
// Reset it by changing `resetKey` (we pass the active bench id).
type Props = { resetKey: string; fallback: ReactNode; children: ReactNode };
type State = { failed: boolean };

export class BenchErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Bench failed to load/render', error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
