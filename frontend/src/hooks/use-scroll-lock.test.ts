/**
 * Body scroll locking.
 *
 * The failure this guards against is order dependent, so every test here holds
 * two locks at once and releases them in a specific order. A test that opens
 * and closes a single modal passes against the broken code just as happily.
 *
 * Under the old per-component locking each holder wrote
 * `document.body.style.overflow` itself and captured whatever was there as the
 * value to restore. Stack two and the inner one captured `'hidden'`, so
 * releasing in the wrong order put `'hidden'` back and left the page
 * unscrollable until a full reload.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useScrollLock, getScrollLockHolders } from './use-scroll-lock';

const overflow = () => document.body.style.overflow;

/** Mounts one holder. `result.unmount()` releases it. */
function hold(active = true) {
  return renderHook(({ on }) => useScrollLock(on), { initialProps: { on: active } });
}

afterEach(() => {
  cleanup();
  // Every test must leave the page scrollable and the lock unheld; if one does
  // not, the counter is module scope and would poison the next test.
  expect(getScrollLockHolders()).toBe(0);
  expect(overflow()).toBe('');
});

describe('a single holder', () => {
  it('locks while held and unlocks when released', () => {
    const modal = hold();
    expect(overflow()).toBe('hidden');

    modal.unmount();
    expect(overflow()).toBe('');
  });

  it('does nothing while inactive', () => {
    const modal = hold(false);
    expect(overflow()).toBe('');

    modal.unmount();
  });

  it('locks and unlocks as the flag flips', () => {
    const modal = renderHook(({ on }) => useScrollLock(on), { initialProps: { on: false } });
    expect(overflow()).toBe('');

    modal.rerender({ on: true });
    expect(overflow()).toBe('hidden');

    modal.rerender({ on: false });
    expect(overflow()).toBe('');

    modal.unmount();
  });
});

describe('two holders at once', () => {
  it('stays locked when the second one closes first', () => {
    const sidebar = hold();
    const modal = hold();

    modal.unmount();

    // The sidebar is still open. Unlocking here is the bug where the page
    // scrolls behind a drawer that is still covering it.
    expect(overflow()).toBe('hidden');

    sidebar.unmount();
    expect(overflow()).toBe('');
  });

  it('unlocks when the first one closes first', () => {
    const sidebar = hold();
    const modal = hold();

    // The order that used to strand the page: the modal captured 'hidden' as
    // the value to restore, so releasing it last put 'hidden' back for good.
    sidebar.unmount();
    expect(overflow()).toBe('hidden');

    modal.unmount();
    expect(overflow()).toBe('');
  });

  it('counts holders rather than tracking a single flag', () => {
    const first = hold();
    expect(getScrollLockHolders()).toBe(1);

    const second = hold();
    expect(getScrollLockHolders()).toBe(2);

    first.unmount();
    expect(getScrollLockHolders()).toBe(1);
    expect(overflow()).toBe('hidden');

    second.unmount();
    expect(getScrollLockHolders()).toBe(0);
  });
});

describe('three holders released in every order', () => {
  it.each([
    ['first, second, third', [0, 1, 2]],
    ['third, second, first', [2, 1, 0]],
    ['second, first, third', [1, 0, 2]],
    ['second, third, first', [1, 2, 0]],
  ])('stays locked until the last one goes, releasing %s', (_label, order) => {
    const holders = [hold(), hold(), hold()];

    order.slice(0, -1).forEach((index) => {
      holders[index]!.unmount();
      expect(overflow()).toBe('hidden');
    });

    holders[order[order.length - 1]!]!.unmount();
    expect(overflow()).toBe('');
  });
});

describe('resilience', () => {
  it('does not go negative when a holder unmounts twice', () => {
    const modal = hold();
    modal.unmount();
    modal.unmount();

    expect(getScrollLockHolders()).toBe(0);

    // A negative count would leave the next lock unable to reach zero, so the
    // page would never unlock again.
    const next = hold();
    expect(overflow()).toBe('hidden');

    next.unmount();
    expect(overflow()).toBe('');
  });
});
