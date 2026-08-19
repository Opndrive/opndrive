'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserSettings, GeneralSettings } from '../types';

const SETTINGS_STORAGE_KEY = 'opndrive_user_settings';

const DEFAULT_SETTINGS: UserSettings = {
  general: {
    startPage: 'home',
    uploadMethod: 'auto',
    bulkShareDuration: '7-days',
  },
  privacy: {
    // Analytics is on by default because it runs on legitimate interests
    // rather than consent: cookieless, aggregate, no profile. This is the one
    // constant to flip if that ever changes.
    enableAnalytics: true,
  },
};

/**
 * Rebuilds settings from stored JSON, keeping only fields we still have.
 *
 * A plain spread would carry whatever happens to be in localStorage straight
 * back into app state, which would keep the three retired privacy flags alive
 * on every existing install. Naming the fields drops them instead, and they
 * are gone from storage the next time anything is saved.
 */
function fromStored(stored: unknown): UserSettings {
  const parsed = (stored ?? {}) as Partial<UserSettings>;

  return {
    general: { ...DEFAULT_SETTINGS.general, ...parsed.general },
    privacy: {
      enableAnalytics: parsed.privacy?.enableAnalytics ?? DEFAULT_SETTINGS.privacy.enableAnalytics,
    },
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load settings from localStorage
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      try {
        setSettings(fromStored(JSON.parse(stored)));
      } catch {
        // Reset to default settings if stored settings are corrupted
        setSettings(DEFAULT_SETTINGS);
      }
    }
    setIsLoaded(true);
  }, []);

  const updateSettings = useCallback((newSettings: Partial<UserSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateGeneralSettings = useCallback(
    (newGeneral: Partial<GeneralSettings>) => {
      updateSettings({
        general: { ...settings.general, ...newGeneral },
      });
    },
    [settings.general, updateSettings]
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  }, []);

  return {
    settings,
    isLoaded,
    updateSettings,
    updateGeneralSettings,
    resetSettings,
  };
}
