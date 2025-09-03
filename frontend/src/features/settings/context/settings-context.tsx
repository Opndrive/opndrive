'use client';

import React, { createContext, useContext } from 'react';
import { SettingsTab } from '../types';

interface SettingsContextType {
  activeTab: SettingsTab;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

interface SettingsProviderProps {
  activeTab: SettingsTab;
  children: React.ReactNode;
}

export function SettingsProvider({ activeTab, children }: SettingsProviderProps) {
  return <SettingsContext.Provider value={{ activeTab }}>{children}</SettingsContext.Provider>;
}

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettingsContext must be used within a SettingsProvider');
  }
  return context;
}
