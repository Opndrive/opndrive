/**
 * The upload event batcher.
 *
 * What it promises is simple and easy to get subtly wrong: every event's
 * outcome arrives, in as few updates as possible, and nothing is lost to the
 * timing between a batch being taken and being applied. The scheduler is
 * injected, so these run on a hand-cranked clock rather than real time.
 */

import { describe, it, expect, vi } from 'vitest';
import { createUploadEventBatcher, UPLOAD_EVENT_WINDOW_MS } from './upload-event-batcher';

/** A scheduler the test fires by hand. */
function manualClock() {
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  return {
    schedule: (run: () => void, ms: number) => {
      const timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    /** Timers scheduled and not yet cancelled or fired. */
    live: () => timers.filter((t) => !t.cancelled),
    fire() {
      const due = timers.splice(0).filter((t) => !t.cancelled);
      for (const timer of due) timer.run();
    },
  };
}

function setup() {
  const clock = manualClock();
  const batches: Record<string, { status: string; progress: number }>[] = [];
  const batcher = createUploadEventBatcher((batch) => batches.push(Object.fromEntries(batch)), {
    schedule: clock.schedule,
  });
  return { clock, batches, batcher };
}

describe('batching', () => {
  it('holds events until the window closes, then hands them over together', () => {
    const { clock, batches, batcher } = setup();

    batcher.push({ id: 'a', status: 'uploading', progress: 0 });
    batcher.push({ id: 'b', status: 'queued', progress: 0 });
    expect(batches).toEqual([]);

    clock.fire();

    expect(batches).toEqual([
      { a: { status: 'uploading', progress: 0 }, b: { status: 'queued', progress: 0 } },
    ]);
  });

  it('keeps only the latest event for each upload', () => {
    const { clock, batches, batcher } = setup();

    batcher.push({ id: 'a', status: 'uploading', progress: 10 });
    batcher.push({ id: 'a', status: 'uploading', progress: 60 });
    batcher.push({ id: 'a', status: 'completed', progress: 100 });
    clock.fire();

    expect(batches).toEqual([{ a: { status: 'completed', progress: 100 } }]);
  });

  it('starts one timer per window, however many events arrive', () => {
    const { clock, batcher } = setup();

    for (let i = 0; i < 1_000; i++) batcher.push({ id: `u${i}`, status: 'queued', progress: 0 });

    expect(clock.live()).toHaveLength(1);
    expect(clock.live()[0]!.ms).toBe(UPLOAD_EVENT_WINDOW_MS);
  });

  it('starts a fresh window for events after a batch went out', () => {
    const { clock, batches, batcher } = setup();

    batcher.push({ id: 'a', status: 'uploading', progress: 0 });
    clock.fire();
    batcher.push({ id: 'a', status: 'completed', progress: 100 });
    clock.fire();

    expect(batches).toEqual([
      { a: { status: 'uploading', progress: 0 } },
      { a: { status: 'completed', progress: 100 } },
    ]);
  });

  it('does not hand over an empty batch', () => {
    const { batches, batcher } = setup();

    batcher.flush();

    expect(batches).toEqual([]);
  });
});

describe('flushing early', () => {
  it('hands over what is queued now, and the window timer then does nothing', () => {
    const { clock, batches, batcher } = setup();

    batcher.push({ id: 'a', status: 'paused', progress: 40 });
    batcher.flush();

    expect(batches).toEqual([{ a: { status: 'paused', progress: 40 } }]);
    expect(clock.live()).toEqual([]);
  });

  it('keeps an event raised while a batch is being applied for the next batch', () => {
    // Applying a batch can make the manager emit: a finished upload frees a
    // slot and the next one starts. That event must not vanish with the batch
    // that caused it.
    const clock = manualClock();
    const seen: string[][] = [];
    const batcher = createUploadEventBatcher(
      (batch) => {
        seen.push([...batch.keys()]);
        if (batch.has('a')) batcher.push({ id: 'b', status: 'uploading', progress: 0 });
      },
      { schedule: clock.schedule }
    );

    batcher.push({ id: 'a', status: 'completed', progress: 100 });
    clock.fire();
    clock.fire();

    expect(seen).toEqual([['a'], ['b']]);
  });
});

describe('cancelling', () => {
  it('drops what is queued and stops the timer', () => {
    const { clock, batches, batcher } = setup();

    batcher.push({ id: 'a', status: 'uploading', progress: 0 });
    batcher.cancel();
    clock.fire();

    expect(batches).toEqual([]);
    expect(clock.live()).toEqual([]);
  });
});

describe('the real timer', () => {
  it('flushes on its own after the window', () => {
    vi.useFakeTimers();
    try {
      const apply = vi.fn();
      const batcher = createUploadEventBatcher(apply);

      batcher.push({ id: 'a', status: 'uploading', progress: 0 });
      vi.advanceTimersByTime(UPLOAD_EVENT_WINDOW_MS - 1);
      expect(apply).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(apply).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
