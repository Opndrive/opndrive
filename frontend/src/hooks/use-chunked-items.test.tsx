/**
 * The search results page reveals results a chunk at a time. A chunk is
 * already in memory, so it appears at once: no timer, no pretend loading.
 * See #79.
 */
import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChunkedItems } from './use-chunked-items';

/** An IntersectionObserver the test drives by hand. */
class FakeObserver {
  static all: FakeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.all.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  disconnect() {
    this.disconnected = true;
  }

  /** The newest observer still watching. */
  static current(): FakeObserver | undefined {
    return [...FakeObserver.all].reverse().find((observer) => !observer.disconnected);
  }

  intersect(isIntersecting = true) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

const items = Array.from({ length: 25 }, (_, i) => `item-${i}`);

function Harness({ list = items, query = 'q' }: { list?: string[]; query?: string }) {
  const { displayedItems, sentinelRef, loadMoreChunks, canLoadMoreChunks } = useChunkedItems(
    list,
    { chunkSize: 10 },
    query
  );
  return (
    <div>
      <p data-testid="shown">{displayedItems.length}</p>
      <button onClick={loadMoreChunks} disabled={!canLoadMoreChunks}>
        more
      </button>
      <div ref={sentinelRef} />
    </div>
  );
}

const shown = () => Number(screen.getByTestId('shown').textContent);

beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useChunkedItems', () => {
  it('shows the first chunk, and the next at once when asked', () => {
    render(<Harness />);
    expect(shown()).toBe(10);

    act(() => screen.getByRole('button').click());

    expect(shown()).toBe(20);
  });

  it('starts no timer to reveal a chunk', () => {
    vi.useFakeTimers();
    render(<Harness />);

    act(() => screen.getByRole('button').click());
    act(() => FakeObserver.current()?.intersect());

    expect(vi.getTimerCount()).toBe(0);
    expect(shown()).toBe(25);
  });

  it('reveals the next chunk when the sentinel nears the viewport', () => {
    render(<Harness />);

    act(() => FakeObserver.current()?.intersect());

    expect(shown()).toBe(20);
  });

  it('watches again after each chunk, so a sentinel still on screen keeps going', () => {
    render(<Harness />);
    const first = FakeObserver.current();

    act(() => first?.intersect());

    expect(first?.disconnected).toBe(true);
    const next = FakeObserver.current();
    expect(next).toBeDefined();
    expect(next).not.toBe(first);
    expect(next?.observed).toHaveLength(1);
  });

  it('ignores the sentinel leaving the viewport', () => {
    render(<Harness />);

    act(() => FakeObserver.current()?.intersect(false));

    expect(shown()).toBe(10);
  });

  it('stops watching once everything is shown', () => {
    render(<Harness />);

    act(() => FakeObserver.current()?.intersect());
    act(() => FakeObserver.current()?.intersect());

    expect(shown()).toBe(25);
    expect(FakeObserver.current()).toBeUndefined();
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('starts over at the first chunk for a new query', () => {
    const { rerender } = render(<Harness query="first" />);
    act(() => screen.getByRole('button').click());
    expect(shown()).toBe(20);

    rerender(<Harness query="second" />);

    expect(shown()).toBe(10);
  });

  // The old version started its timer inside a state updater, which Strict
  // Mode calls twice: one intersection then revealed two chunks.
  it('reveals one chunk per intersection under Strict Mode', () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>
    );

    act(() => FakeObserver.current()?.intersect());

    expect(shown()).toBe(20);
  });
});
