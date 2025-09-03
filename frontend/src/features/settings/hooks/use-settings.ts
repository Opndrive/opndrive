'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserSettings, GeneralSettings } from '../types';

const SETTINGS_STORAGE_KEY = 'opndrive_user_settings';

const DEFAULT_SETTINGS: UserSettings = {
  general: {
    startPage: 'home',
    uploadMethod: 'auto',
  },
  privacy: {
    makeAccountPrivate: false,
    allowFileSharing: true,
    enableAnalytics: true,
    dataEncryption: false,
  },
};

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load settings from localStorage
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (error) {
        console.error('Failed to parse stored settings:', error);
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
