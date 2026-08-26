/**
 * The one place that knows a file drag is happening.
 *
 * The bug these tests exist for: the drag used to be detected by a handler
 * mounted inside the tree, so any component that stopped an event on its way
 * up blinded it for the rest of the drag - and the file table did exactly
 * that, which left every folder row in the list view unable to accept a drop
 * unless the pointer had first entered from outside the table.
 *
 * So the cases here dispatch from *inside* a component that stops the event,
 * and from deep inside a folder row, and expect the provider to see both.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { EnhancedDragDropProvider, useEnhancedDragDrop } from './enhanced-drag-drop-provider';
import { DROP_TARGET_ATTRIBUTE } from '../utils/drag-events';

function Probe() {
  const { isFileDragActive, hoveredTargetId } = useEnhancedDragDrop();

  return (
    <div>
      <span data-testid="active">{String(isFileDragActive)}</span>
      <span data-testid="hovered">{hoveredTargetId ?? 'none'}</span>

      {/* A folder row, with the pointer landing on its label rather than on it */}
      <div {...{ [DROP_TARGET_ATTRIBUTE]: 'folder-a' }}>
        <span data-testid="label-a">Photos</span>
      </div>
      <div {...{ [DROP_TARGET_ATTRIBUTE]: 'folder-b' }} data-testid="row-b" />

      {/* The listing around them, which stops drag events the way the file
          table did - the arrangement that broke the old detection */}
      <div
        data-testid="listing"
        onDragOver={(e) => e.stopPropagation()}
        onDrop={(e) => e.stopPropagation()}
      >
        <span data-testid="gap">between the rows</span>
      </div>
    </div>
  );
}

/**
 * jsdom implements neither DragEvent nor DataTransfer, so the event carries
 * hand-built stand-ins for the two fields the provider reads.
 */
function fireDrag(type: string, target: EventTarget, { types }: { types?: string[] | null } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });

  Object.defineProperty(event, 'dataTransfer', {
    value: types === undefined ? { types: ['Files'], dropEffect: 'none' } : types && { types },
  });

  act(() => {
    target.dispatchEvent(event);
  });

  return event;
}

/** Let the clock run without any dragover arriving. */
function silence(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const active = () => screen.getByTestId('active').textContent;
const hovered = () => screen.getByTestId('hovered').textContent;

beforeEach(() => {
  // The drag ends on a watchdog rather than on any event, so the clock is part
  // of the behaviour under test.
  vi.useFakeTimers();

  render(
    <EnhancedDragDropProvider>
      <Probe />
    </EnhancedDragDropProvider>
  );
});

afterEach(() => {
  vi.useRealTimers();
  // The listeners live on window, so a leaked one would answer the next test.
  document.body.innerHTML = '';
});

describe('seeing the drag at all', () => {
  it('starts with no drag', () => {
    expect(active()).toBe('false');
    expect(hovered()).toBe('none');
  });

  it('sees a drag that begins inside a component which stops the event', () => {
    fireDrag('dragover', screen.getByTestId('gap'));

    // The regression, exactly: the listing stops this event, and a listener
    // waiting on the way up would never run. Capture is why this passes.
    expect(active()).toBe('true');
  });

  it('sees a drag over a folder row nested in that same component', () => {
    fireDrag('dragover', screen.getByTestId('label-a'));

    expect(active()).toBe('true');
    expect(hovered()).toBe('folder-a');
  });

  it('ignores a drag carrying no files', () => {
    fireDrag('dragover', screen.getByTestId('gap'), { types: ['text/plain'] });

    expect(active()).toBe('false');
  });

  it('ignores an event with no dataTransfer', () => {
    fireDrag('dragover', screen.getByTestId('gap'), { types: null });

    expect(active()).toBe('false');
  });

  it('cancels the event so the browser does not take the drop and navigate away', () => {
    const event = fireDrag('dragover', screen.getByTestId('gap'));

    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a non-file drag uncancelled', () => {
    const event = fireDrag('dragover', screen.getByTestId('gap'), { types: ['text/plain'] });

    expect(event.defaultPrevented).toBe(false);
  });

  it('asks for a copy cursor', () => {
    const event = fireDrag('dragover', screen.getByTestId('gap'));

    expect((event as DragEvent).dataTransfer?.dropEffect).toBe('copy');
  });
});

describe('which folder the pointer is over', () => {
  it('names the folder under the pointer, read from where the pointer is', () => {
    fireDrag('dragover', screen.getByTestId('label-a'));

    expect(hovered()).toBe('folder-a');
  });

  it('switches to another folder without needing a leave in between', () => {
    fireDrag('dragover', screen.getByTestId('label-a'));
    fireDrag('dragover', screen.getByTestId('row-b'));

    // Every dragover is a fresh reading, so nothing has to be un-done first.
    expect(hovered()).toBe('folder-b');
  });

  it('clears the folder once the pointer is back on the listing', () => {
    fireDrag('dragover', screen.getByTestId('label-a'));
    fireDrag('dragover', screen.getByTestId('gap'));

    // No folder, but the drag is still on: it uploads to the current prefix.
    expect(hovered()).toBe('none');
    expect(active()).toBe('true');
  });

  it('holds the folder for as long as the pointer stays on it', () => {
    fireDrag('dragover', screen.getByTestId('label-a'));
    fireDrag('dragover', screen.getByTestId('label-a'));
    fireDrag('dragover', screen.getByTestId('label-a'));

    // dragover repeats while the pointer is stationary. The old code counted
    // enter against leave and drifted; this just reads the same answer again.
    expect(hovered()).toBe('folder-a');
  });
});

describe('ending the drag', () => {
  beforeEach(() => {
    fireDrag('dragover', screen.getByTestId('label-a'));
  });

  it('ends on a drop, even one a folder row stops', () => {
    fireDrag('drop', screen.getByTestId('gap'));

    // The listing stops this too, and a folder row stops it in earnest so the
    // listing does not upload to the current prefix as well.
    expect(active()).toBe('false');
    expect(hovered()).toBe('none');
  });

  it('ends once dragover goes quiet, which is the pointer having left', () => {
    // Dragging out of the window fires nothing dependable, and dropping outside
    // it fires nothing here at all. Silence is what both have in common.
    silence(600);

    expect(active()).toBe('false');
    expect(hovered()).toBe('none');
  });

  it('is not ended by a dragleave', () => {
    fireDrag('dragleave', screen.getByTestId('label-a'));

    // WebKit reports a null relatedTarget on every dragleave it fires, so
    // treating one as leaving the window strobed the highlight on Safari every
    // time the pointer crossed a row.
    expect(active()).toBe('true');
    expect(hovered()).toBe('folder-a');
  });

  it('ends on dragend', () => {
    fireDrag('dragend', screen.getByTestId('gap'));

    expect(active()).toBe('false');
  });

  it('holds for as long as dragover keeps arriving', () => {
    // The model reruns every 350ms even with the pointer held still, so a live
    // drag can never be quiet for a full window. Each one restarts the clock.
    silence(400);
    fireDrag('dragover', screen.getByTestId('label-a'));
    silence(400);
    fireDrag('dragover', screen.getByTestId('label-a'));
    silence(400);

    expect(active()).toBe('true');
    expect(hovered()).toBe('folder-a');
  });

  it('does not leave the watchdog running after a drop', () => {
    fireDrag('drop', screen.getByTestId('gap'));
    fireDrag('dragover', screen.getByTestId('row-b'));
    silence(400);

    // A timer left over from the previous drag would land mid-way through this
    // one and cancel it.
    expect(active()).toBe('true');
    expect(hovered()).toBe('folder-b');
  });

  it('picks up again after a drop', () => {
    fireDrag('drop', screen.getByTestId('gap'));
    fireDrag('dragover', screen.getByTestId('row-b'));

    expect(active()).toBe('true');
    expect(hovered()).toBe('folder-b');
  });
});

describe('outside a provider', () => {
  it('refuses to guess at the drag state', () => {
    function Orphan() {
      useEnhancedDragDrop();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(/must be used within/);
  });
});
