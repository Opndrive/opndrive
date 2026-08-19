import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettings } from './use-settings';

const STORAGE_KEY = 'opndrive_user_settings';

beforeEach(() => {
  localStorage.clear();
});

describe('useSettings', () => {
  it('starts from the defaults when nothing is stored', () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.settings.privacy.enableAnalytics).toBe(true);
    expect(result.current.settings.general.startPage).toBe('home');
    expect(result.current.isLoaded).toBe(true);
  });

  it('restores what was stored', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ general: { startPage: 'my-drive' }, privacy: { enableAnalytics: false } })
    );

    const { result } = renderHook(() => useSettings());

    expect(result.current.settings.general.startPage).toBe('my-drive');
    expect(result.current.settings.privacy.enableAnalytics).toBe(false);
  });

  it('fills in fields the stored copy is missing', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ general: { startPage: 'my-drive' } }));

    const { result } = renderHook(() => useSettings());

    expect(result.current.settings.privacy.enableAnalytics).toBe(true);
    expect(result.current.settings.general.uploadMethod).toBe('auto');
  });

  it('falls back to defaults when the stored copy is not valid json', () => {
    localStorage.setItem(STORAGE_KEY, 'not json at all');

    const { result } = renderHook(() => useSettings());

    expect(result.current.settings.privacy.enableAnalytics).toBe(true);
  });

  // The three flags below were persisted but read by nothing, and described
  // features that do not exist. Dropping them from the type is not enough on
  // its own: every existing install still has them in localStorage.
  describe('retired privacy flags', () => {
    const legacyStored = {
      general: { startPage: 'home', uploadMethod: 'auto', bulkShareDuration: '7-days' },
      privacy: {
        makeAccountPrivate: true,
        allowFileSharing: false,
        enableAnalytics: false,
        dataEncryption: true,
      },
    };

    it('drops them when loading an older stored copy', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyStored));

      const { result } = renderHook(() => useSettings());

      expect(result.current.settings.privacy).toEqual({ enableAnalytics: false });
    });

    it('purges them from storage on the next save', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyStored));

      const { result } = renderHook(() => useSettings());
      act(() => result.current.updateGeneralSettings({ startPage: 'my-drive' }));

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');

      expect(saved.privacy).toEqual({ enableAnalytics: false });
    });
  });

  it('persists an update and leaves the rest alone', () => {
    const { result } = renderHook(() => useSettings());

    act(() => result.current.updateGeneralSettings({ uploadMethod: 'signed-url' }));

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');

    expect(saved.general.uploadMethod).toBe('signed-url');
    expect(saved.general.startPage).toBe('home');
    expect(saved.privacy.enableAnalytics).toBe(true);
  });

  it('clears storage on reset', () => {
    const { result } = renderHook(() => useSettings());

    act(() => result.current.updateGeneralSettings({ startPage: 'my-drive' }));
    act(() => result.current.resetSettings());

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.settings.general.startPage).toBe('home');
  });
});
