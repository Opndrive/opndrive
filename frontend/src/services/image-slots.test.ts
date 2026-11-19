import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MAX_LOADING_IMAGES,
  imageSlotStats,
  requestImageSlot,
  resetImageSlots,
} from './image-slots';

beforeEach(() => resetImageSlots());

describe('a few images at a time', () => {
  it('grants up to the limit straight away and queues the rest', () => {
    const granted = Array.from({ length: MAX_LOADING_IMAGES + 2 }, () => vi.fn());
    granted.forEach((onGranted) => requestImageSlot(onGranted));

    expect(granted.filter((g) => g.mock.calls.length > 0)).toHaveLength(MAX_LOADING_IMAGES);
    expect(imageSlotStats()).toEqual({ active: MAX_LOADING_IMAGES, waiting: 2 });
  });

  it('hands a released slot to the longest waiter', () => {
    const releases = Array.from({ length: MAX_LOADING_IMAGES }, () => requestImageSlot(vi.fn()));
    const first = vi.fn();
    const second = vi.fn();
    requestImageSlot(first);
    requestImageSlot(second);

    releases[0]!();

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('lets a waiter that gives up leave without ever starting', () => {
    const releases = Array.from({ length: MAX_LOADING_IMAGES }, () => requestImageSlot(vi.fn()));
    const gaveUp = vi.fn();
    const next = vi.fn();
    const leave = requestImageSlot(gaveUp);
    requestImageSlot(next);

    leave();
    releases[0]!();

    expect(gaveUp).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('counts a slot released twice once', () => {
    const release = requestImageSlot(vi.fn());
    release();
    release();

    expect(imageSlotStats()).toEqual({ active: 0, waiting: 0 });
  });
});
