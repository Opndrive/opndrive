'use client';

import { cn } from '@/shared/utils/utils';
import { SettingsTab } from '../types';
import { SETTINGS_TABS } from '../constants';

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  return (
    <>
      {SETTINGS_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center w-full text-sm transition-all duration-200 ease-in-out group px-3 py-2 rounded-lg',
            activeTab === tab.id
              ? 'bg-primary text-primary-foreground font-medium shadow-sm'
              : 'text-secondary-foreground hover:text-foreground hover:bg-accent'
          )}
        >
          <span className="truncate">{tab.label}</span>
        </button>
      ))}
    </>
  );
}
