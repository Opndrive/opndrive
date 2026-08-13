/**
 * Delete recovery records.
 *
 * The whole point of these records is to outlive the tab, and to never be acted
 * on against the wrong bucket. Both of those are covered here, along with the
 * ordering helper that keeps a resumed delete from recreating the very bug the
 * marker fix removed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useDeleteRecoveryStore,
  interruptedDeletesForBucket,
  type InterruptedDelete,
} from './use-delete-recovery-store';
import { markerLast } from '../utils/delete-key-order';

const store = () => useDeleteRecoveryStore.getState();

function record(overrides: Partial<InterruptedDelete> = {}): InterruptedDelete {
  return {
    id: 'op-1',
    bucket: 'bucket-a',
    prefix: 'docs/',
    name: 'docs',
    totalItems: 12,
    startedAt: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  useDeleteRecoveryStore.setState({ records: {} });
});

describe('recording', () => {
  it('keeps a started delete', () => {
    store().recordStarted(record());

    expect(store().records['op-1']).toMatchObject({ prefix: 'docs/', bucket: 'bucket-a' });
  });

  it('clears a record once the delete reports back', () => {
    store().recordStarted(record());
    store().clearRecord('op-1');

    expect(store().records).toEqual({});
  });

  it('ignores a clear for something it never had', () => {
    store().recordStarted(record());
    store().clearRecord('does-not-exist');

    expect(Object.keys(store().records)).toEqual(['op-1']);
  });

  it('tracks several deletes at once', () => {
    store().recordStarted(record());
    store().recordStarted(record({ id: 'op-2', prefix: 'photos/', name: 'photos' }));

    expect(Object.keys(store().records)).toHaveLength(2);
  });
});

/**
 * The one property the whole feature rests on. Every other test here seeds
 * state directly, so all of them would still pass if persistence quietly did
 * nothing and every record died with the tab.
 */
describe('surviving the tab', () => {
  // Restored here rather than at the end of each test: a failing assertion
  // would otherwise leave setItem throwing for every test after it
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stored() {
    const raw = localStorage.getItem('delete-recovery-storage');
    return raw ? JSON.parse(raw).state.records : null;
  }

  it('writes the record to local storage', () => {
    store().recordStarted(record());

    expect(stored()['op-1']).toMatchObject({
      bucket: 'bucket-a',
      prefix: 'docs/',
      name: 'docs',
    });
  });

  it('takes the record back out again when it is cleared', () => {
    store().recordStarted(record());
    store().clearRecord('op-1');

    expect(stored()).toEqual({});
  });

  /**
   * The record is written from inside the delete. If storage can throw out of
   * that call, then private mode or a full quota fails the delete itself,
   * which is much worse than having no record.
   */
  it('does not throw when storage refuses to write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => store().recordStarted(record())).not.toThrow();
    expect(() => store().clearRecord('op-1')).not.toThrow();

    setItem.mockRestore();
  });

  it('still tracks the record in memory when storage is unavailable', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    store().recordStarted(record());

    expect(store().records['op-1']).toBeDefined();
    setItem.mockRestore();
  });
});

describe('bucket pinning', () => {
  beforeEach(() => {
    store().recordStarted(record({ id: 'a', bucket: 'bucket-a', startedAt: 2000 }));
    store().recordStarted(record({ id: 'b', bucket: 'bucket-b', startedAt: 1000 }));
  });

  it('only returns records aimed at the bucket in front of the user', () => {
    const found = interruptedDeletesForBucket(store().records, 'bucket-a');

    expect(found.map((r) => r.id)).toEqual(['a']);
  });

  it('returns nothing for a bucket with no interrupted deletes', () => {
    expect(interruptedDeletesForBucket(store().records, 'bucket-c')).toEqual([]);
  });

  it('returns nothing before a bucket is known, rather than everything', () => {
    expect(interruptedDeletesForBucket(store().records, undefined)).toEqual([]);
    expect(interruptedDeletesForBucket(store().records, null)).toEqual([]);
    expect(interruptedDeletesForBucket(store().records, '')).toEqual([]);
  });

  it('leaves another bucket record alone, since that session may come back', () => {
    store().clearRecord('a');

    expect(store().records['b']).toBeDefined();
  });

  it('puts the oldest interruption first', () => {
    store().recordStarted(record({ id: 'c', bucket: 'bucket-a', startedAt: 500 }));

    const found = interruptedDeletesForBucket(store().records, 'bucket-a');
    expect(found.map((r) => r.id)).toEqual(['c', 'a']);
  });
});

describe('markerLast', () => {
  it('moves the folder marker to the end', () => {
    expect(markerLast(['docs/', 'docs/a.txt', 'docs/b.txt'], 'docs/')).toEqual([
      'docs/a.txt',
      'docs/b.txt',
      'docs/',
    ]);
  });

  it('adds the marker when the listing had none', () => {
    expect(markerLast(['docs/a.txt'], 'docs/')).toEqual(['docs/a.txt', 'docs/']);
  });

  it('never repeats the marker', () => {
    const ordered = markerLast(['docs/', 'docs/a.txt', 'docs/'], 'docs/');

    expect(ordered.filter((key) => key === 'docs/')).toHaveLength(1);
  });

  it('leaves nested folder markers where they are', () => {
    expect(markerLast(['docs/', 'docs/sub/', 'docs/sub/a.txt'], 'docs/')).toEqual([
      'docs/sub/',
      'docs/sub/a.txt',
      'docs/',
    ]);
  });
});
