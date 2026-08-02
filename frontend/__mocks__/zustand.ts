/**
 * Auto-reset wrapper around zustand, applied to every test run.
 *
 * Zustand stores are created once at module scope, so a store written to in
 * one test is still holding that state in the next one. Test order then starts
 * to matter, and a suite can pass in isolation while failing in a full run (or,
 * worse, pass in a full run only because an earlier test happened to leave the
 * right state behind).
 *
 * This records the initial state of every store as it is created and restores
 * all of them after each test. It is the pattern from zustand's own testing
 * docs; `vi.mock('zustand')` in the setup file is what activates it.
 */

import { act } from '@testing-library/react';
import type * as ZustandExportedTypes from 'zustand';
import { afterEach, vi } from 'vitest';

export * from 'zustand';

const { create: actualCreate, createStore: actualCreateStore } =
  await vi.importActual<typeof ZustandExportedTypes>('zustand');

/** Reset callbacks, one per store created during the run. */
export const storeResetFns = new Set<() => void>();

/**
 * Copies a state object one level deep, cloning the data and keeping the
 * actions.
 *
 * `structuredClone` cannot be used on the whole state: zustand keeps its
 * actions alongside the data and functions are not cloneable, so it would
 * throw. Anything it refuses (a class instance, a proxy) keeps its reference
 * rather than failing the reset.
 */
function cloneState<T>(state: T): T {
  const copy = { ...(state as object) } as Record<string, unknown>;
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === 'function') continue;
    try {
      copy[key] = structuredClone(value);
    } catch {
      // Not cloneable - leave the original reference in place.
    }
  }
  return copy as T;
}

function trackReset<T>(store: {
  getInitialState: () => T;
  setState: (s: T, replace: true) => void;
}) {
  // Snapshot taken at store creation, before any test can touch it, and never
  // handed out. Each reset installs a FRESH copy of it.
  //
  // Restoring the captured object directly is not enough: a test that mutates
  // a nested value in place (`state.downloads.set(...)` rather than going
  // through an action) mutates the very object the reset restores, so the
  // pollution survives every subsequent reset.
  const pristine = cloneState(store.getInitialState());

  storeResetFns.add(() => {
    // `replace: true` matters too: a partial set would leave keys added by a
    // test in place.
    store.setState(cloneState(pristine), true);
  });
  return store;
}

export const create = (<T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  // Supports both the curried `create<T>()(fn)` and direct `create(fn)` forms.
  return typeof stateCreator === 'function'
    ? trackReset(actualCreate(stateCreator))
    : (curried: ZustandExportedTypes.StateCreator<T>) => trackReset(actualCreate(curried));
}) as typeof ZustandExportedTypes.create;

export const createStore = (<T>(stateCreator: ZustandExportedTypes.StateCreator<T>) => {
  return typeof stateCreator === 'function'
    ? trackReset(actualCreateStore(stateCreator))
    : (curried: ZustandExportedTypes.StateCreator<T>) => trackReset(actualCreateStore(curried));
}) as typeof ZustandExportedTypes.createStore;

afterEach(() => {
  act(() => {
    storeResetFns.forEach((reset) => reset());
  });
});
