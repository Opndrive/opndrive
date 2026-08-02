/**
 * Upload settings store.
 *
 * Small, but the only store in the app wrapped in zustand's `persist`
 * middleware, so the interesting behaviour is the localStorage round-trip
 * rather than the single setter.
 *
 * Hydration is driven through `persist.rehydrate()` rather than by re-importing
 * the module: the store is created once at import time, so seeding localStorage
 * afterwards has no effect on its own.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useUploadSettingsStore } from './use-upload-settings-store';

const STORAGE_KEY = 'upload-settings-storage';
const store = () => useUploadSettingsStore.getState();

/** What persist writes: the state under `state`, plus its schema version. */
function stored(mode: string) {
  return JSON.stringify({ state: { uploadMode: mode }, version: 0 });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('defaults', () => {
  it('starts on multipart', () => {
    // Multipart is resumable and handles large files; signed-url is the
    // fallback for restricted buckets, so it must not be the default.
    expect(store().uploadMode).toBe('multipart');
  });
});

describe('setUploadMode', () => {
  it('switches to signed-url', () => {
    store().setUploadMode('signed-url');

    expect(store().uploadMode).toBe('signed-url');
  });

  it('switches back to multipart', () => {
    store().setUploadMode('signed-url');

    store().setUploadMode('multipart');

    expect(store().uploadMode).toBe('multipart');
  });

  it('is idempotent', () => {
    store().setUploadMode('signed-url');
    store().setUploadMode('signed-url');

    expect(store().uploadMode).toBe('signed-url');
  });
});

describe('persistence', () => {
  it('writes the choice to localStorage', () => {
    store().setUploadMode('signed-url');

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).state.uploadMode).toBe('signed-url');
  });

  it('stores it under the documented key', () => {
    store().setUploadMode('signed-url');

    // Renaming this key silently resets everyone's preference on deploy.
    expect(Object.keys(localStorage)).toContain(STORAGE_KEY);
  });

  it('hydrates a saved choice', async () => {
    localStorage.setItem(STORAGE_KEY, stored('signed-url'));

    await useUploadSettingsStore.persist.rehydrate();

    // This is what a returning user gets on page load.
    expect(store().uploadMode).toBe('signed-url');
  });

  it('keeps the default when nothing is stored', async () => {
    await useUploadSettingsStore.persist.rehydrate();

    expect(store().uploadMode).toBe('multipart');
  });

  it('keeps the default when the stored value is corrupt', async () => {
    localStorage.setItem(STORAGE_KEY, 'not json at all');

    // A user with a mangled entry should still get a working uploader.
    await expect(useUploadSettingsStore.persist.rehydrate()).resolves.toBeUndefined();
    expect(store().uploadMode).toBe('multipart');
  });

  it('does not lose the setter when hydrating', async () => {
    localStorage.setItem(STORAGE_KEY, stored('signed-url'));

    await useUploadSettingsStore.persist.rehydrate();

    // Persist merges into the existing state; if it replaced it wholesale the
    // actions would be gone and the settings UI would crash on click.
    expect(typeof store().setUploadMode).toBe('function');
    store().setUploadMode('multipart');
    expect(store().uploadMode).toBe('multipart');
  });

  it('reports that hydration has happened', async () => {
    // hasHydrated is a lifecycle flag on the shared store, not per-test state,
    // and rehydrate() flips it false until it settles. Driving one here makes
    // the assertion independent of whatever ran before.
    await useUploadSettingsStore.persist.rehydrate();

    expect(useUploadSettingsStore.persist.hasHydrated()).toBe(true);
  });
});

describe('isolation between tests', () => {
  it('A: leaves a non-default mode behind', () => {
    store().setUploadMode('signed-url');

    expect(store().uploadMode).toBe('signed-url');
  });

  it('B: still starts from the default', () => {
    // The zustand reset covers persisted stores too, so a preference set in one
    // test cannot leak into the next.
    expect(store().uploadMode).toBe('multipart');
  });
});
