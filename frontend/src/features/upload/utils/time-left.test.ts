/**
 * The time left on uploads. It used to be invented - a random "speed" and a
 * formula on the progress bar - so a 5 GB folder said "6 min left" and took
 * far longer. These pin that it is measured, and silent when it cannot be.
 */

import { describe, expect, it } from 'vitest';
import { TimeLeftMeter, formatTimeLeft, type TimeLeftEntry } from './time-left';

const MB = 1024 * 1024;

function file(
  id: string,
  size: number | undefined,
  progress: number,
  status = 'uploading'
): TimeLeftEntry {
  return { id, type: 'file', status, progress, size };
}

/** Feeds the meter one reading a second while `progressAt(second)` moves. */
function run(
  meter: TimeLeftMeter,
  seconds: number,
  entriesAt: (second: number) => TimeLeftEntry[],
  start = 0
): number | null {
  let result: number | null = null;
  for (let s = 0; s <= seconds; s++) result = meter.update(entriesAt(s), (start + s) * 1000);
  return result;
}

describe('TimeLeftMeter', () => {
  it('says nothing until it has watched long enough to measure', () => {
    const meter = new TimeLeftMeter();
    // 1 GB at 1 MB/s, watched for 5 seconds.
    const result = run(meter, 5, (s) => [file('a', 1024 * MB, (s * MB * 100) / (1024 * MB))]);

    expect(result).toBeNull();
  });

  it('measures the real rate and divides what is left by it', () => {
    const meter = new TimeLeftMeter();
    const size = 1000 * MB;
    // 2 MB/s for 20 seconds: 40 MB sent, 960 MB left, so 480 seconds.
    const result = run(meter, 20, (s) => [file('a', size, ((s * 2 * MB) / size) * 100)]);

    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(480, 0);
  });

  it('follows the network, not the progress bar: half the speed, twice the time', () => {
    const fast = run(new TimeLeftMeter(), 20, (s) => [
      file('a', 1000 * MB, (s * 4 * MB * 100) / (1000 * MB)),
    ]);
    const slow = run(new TimeLeftMeter(), 20, (s) => [
      file('a', 1000 * MB, (s * 2 * MB * 100) / (1000 * MB)),
    ]);

    expect(slow! / fast!).toBeGreaterThan(1.9);
  });

  it('counts every file of a folder, queued ones included, in what is left', () => {
    const meter = new TimeLeftMeter();
    // One file moving at 1 MB/s, nine more of 100 MB still queued.
    const result = run(meter, 20, (s) => [
      file('a', 100 * MB, s),
      ...Array.from({ length: 9 }, (_, i) => file(`q${i}`, 100 * MB, 0, 'queued')),
    ]);

    // 980 MB left at 1 MB/s.
    expect(result!).toBeCloseTo(980, -1);
  });

  it('does not count the folder card on top of its files', () => {
    const meter = new TimeLeftMeter();
    const result = run(meter, 20, (s) => [
      { id: 'folder', type: 'folder', status: 'uploading', progress: s, size: 1000 * MB },
      file('a', 100 * MB, s),
    ]);

    // Only the file's 80 MB left, at 1 MB/s.
    expect(result!).toBeCloseTo(80, -1);
  });

  it('says nothing while everything is paused', () => {
    const meter = new TimeLeftMeter();
    run(meter, 20, (s) => [file('a', 100 * MB, s)]);

    const paused = meter.update([file('a', 100 * MB, 20, 'paused')], 21_000);
    expect(paused).toBeNull();
  });

  it('says nothing once nothing has moved for the whole window', () => {
    const meter = new TimeLeftMeter();
    run(meter, 20, (s) => [file('a', 100 * MB, s)]);
    // Stuck at 20% for a minute: still "uploading", waiting on the network.
    const stuck = run(meter, 60, () => [file('a', 100 * MB, 20)], 21);

    expect(stuck).toBeNull();
  });

  it('says nothing when a file of unknown size is still to go', () => {
    const meter = new TimeLeftMeter();
    const result = run(meter, 20, (s) => [
      file('a', 100 * MB, s),
      file('b', undefined, 0, 'queued'),
    ]);

    expect(result).toBeNull();
  });

  it('does not take a file first seen half done for a burst of speed', () => {
    const meter = new TimeLeftMeter();
    // Opened mid-upload at 50% of 1 GB, then 1 MB/s.
    const result = run(meter, 20, (s) => [file('a', 1024 * MB, 50 + (s * MB * 100) / (1024 * MB))]);

    // About 492 MB left at 1 MB/s, not seconds.
    expect(result!).toBeGreaterThan(400);
  });

  it('leaves finished, failed and cancelled files out of what is left', () => {
    const meter = new TimeLeftMeter();
    const result = run(meter, 20, (s) => [
      file('a', 100 * MB, s),
      file('done', 500 * MB, 100, 'completed'),
      file('bad', 500 * MB, 30, 'failed'),
      file('gone', 500 * MB, 10, 'cancelled'),
    ]);

    expect(result!).toBeCloseTo(80, -1);
  });

  it('keeps its estimate between files, when no file is mid-upload at the moment of reading', () => {
    const meter = new TimeLeftMeter();
    // Twenty 1 MB files, one a second; every reading lands between two of them.
    const result = run(meter, 20, (s) =>
      Array.from({ length: 40 }, (_, i) =>
        i < s ? file(`f${i}`, MB, 100, 'completed') : file(`f${i}`, MB, 0, 'queued')
      )
    );

    // 20 MB left at 1 MB/s.
    expect(result!).toBeCloseTo(20, -1);
  });

  it('starts a later batch fresh rather than averaging in the idle time before it', () => {
    const meter = new TimeLeftMeter();
    run(meter, 20, (s) => [file('a', 100 * MB, s)]);
    meter.update([file('a', 100 * MB, 100, 'completed')], 25_000);

    // A new upload two minutes later, 1 MB/s.
    const later = run(meter, 20, (s) => [file('b', 100 * MB, s)], 145);
    expect(later!).toBeCloseTo(80, -1);
  });
});

describe('formatTimeLeft', () => {
  it.each([
    [30, 'Less than a minute left'],
    [61, 'About 2 min left'],
    [9 * 60, 'About 9 min left'],
    [23 * 60, 'About 25 min left'],
    [58 * 60, 'About 1 hr left'],
    [95 * 60, 'About 1 hr 40 min left'],
    [119 * 60, 'About 2 hr left'],
    [5 * 3600 + 3 * 60, 'About 5 hr left'],
  ])('reads %i seconds as "%s"', (seconds, text) => {
    expect(formatTimeLeft(seconds)).toBe(text);
  });

  it('says nothing for a value that is not a time', () => {
    expect(formatTimeLeft(Number.POSITIVE_INFINITY)).toBe('');
    expect(formatTimeLeft(-5)).toBe('');
  });
});
