/**
 * ErrorBoundary.
 *
 * The point of this component is that a thrown render never reaches the top of
 * the tree, so the tests deliberately throw for real rather than asserting on
 * props. React logs caught errors itself, which is why console.error is stubbed
 * here - the assertions still check that our own logging happened.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './error-boundary';

function Bomb({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('viewer exploded');
  }
  return <p>rendered fine</p>;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('when nothing throws', () => {
  it('renders its children untouched', () => {
    render(
      <ErrorBoundary fallback={<p>fallback</p>}>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('rendered fine')).toBeDefined();
    expect(screen.queryByText('fallback')).toBeNull();
  });
});

describe('when a child throws', () => {
  it('shows the fallback instead of unmounting the tree', () => {
    render(
      <div>
        <p>sibling survives</p>
        <ErrorBoundary fallback={<p>fallback</p>}>
          <Bomb />
        </ErrorBoundary>
      </div>
    );

    expect(screen.getByText('fallback')).toBeDefined();
    expect(screen.getByText('sibling survives')).toBeDefined();
  });

  it('logs the error so it is not swallowed in production', () => {
    render(
      <ErrorBoundary fallback={<p>fallback</p>}>
        <Bomb />
      </ErrorBoundary>
    );

    expect(consoleError).toHaveBeenCalledWith(
      'Render error caught by boundary:',
      expect.objectContaining({ message: 'viewer exploded' }),
      expect.anything()
    );
  });

  it('hands the error and a reset callback to a function fallback', () => {
    render(
      <ErrorBoundary fallback={(error, reset) => <button onClick={reset}>{error.message}</button>}>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: 'viewer exploded' })).toBeDefined();
  });

  it('reports the error through onError', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary fallback={<p>fallback</p>} onError={onError}>
        <Bomb />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'viewer exploded' }),
      expect.anything()
    );
  });
});

describe('recovering', () => {
  it('retries the children when the fallback resets', () => {
    // Flipped outside render, so the component itself stays side effect free
    let stillBroken = true;
    function Flaky() {
      if (stillBroken) {
        throw new Error('first attempt failed');
      }
      return <p>second attempt worked</p>;
    }

    render(
      <ErrorBoundary fallback={(_error, reset) => <button onClick={reset}>Try again</button>}>
        <Flaky />
      </ErrorBoundary>
    );

    stillBroken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('second attempt worked')).toBeDefined();
  });

  it('clears the error when the resetKey changes', () => {
    const { rerender } = render(
      <ErrorBoundary fallback={<p>fallback</p>} resetKey="file-a">
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText('fallback')).toBeDefined();

    // Moving to another file must not leave the previous file's error up
    rerender(
      <ErrorBoundary fallback={<p>fallback</p>} resetKey="file-b">
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('rendered fine')).toBeDefined();
    expect(screen.queryByText('fallback')).toBeNull();
  });

  it('keeps the fallback up while the resetKey stays the same', () => {
    const { rerender } = render(
      <ErrorBoundary fallback={<p>fallback</p>} resetKey="file-a">
        <Bomb />
      </ErrorBoundary>
    );

    rerender(
      <ErrorBoundary fallback={<p>fallback</p>} resetKey="file-a">
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('fallback')).toBeDefined();
  });
});
