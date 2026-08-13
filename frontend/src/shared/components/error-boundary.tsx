'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * What to show once something throws. The function form receives the error
   * and a reset callback, so a fallback can offer a retry.
   */
  fallback: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /**
   * Changing this clears the error. Pass whatever the subtree is about, such as
   * a file id, so moving on from a bad item does not leave the fallback up.
   */
  resetKey?: unknown;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * React only catches render errors in class components, so this stays a class.
 *
 * The App Router error.tsx files cover whole route segments. This one is for
 * the smaller surfaces inside a route - the preview viewers above all - where
 * blanking the entire route would be a far worse answer than swapping a single
 * panel for a message. It is also the only option for anything rendered by a
 * layout, since a segment's error.tsx does not catch its own layout.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The dev overlay shows this anyway, but in production it would otherwise
    // disappear with no trace of why the panel went blank.
    console.error('Render error caught by boundary:', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    return typeof this.props.fallback === 'function'
      ? this.props.fallback(error, this.reset)
      : this.props.fallback;
  }
}
