'use client';

import { sidebarRowClasses } from '@/shared/utils/sidebar-row';
import { SettingsTab } from '../types';
import { SETTINGS_TABS } from '../constants';

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

/**
 * These rows carried their own copy of the dashboard nav row's classes, right
 * down to the active and hover states. They now share one description of a
 * sidebar row with `SidebarItem` and `SidebarDropdown`, so a change to how a
 * row looks reaches all three instead of two.
 *
 * No icons here on purpose: settings is a sub-navigation and its tabs are
 * text-only, so `SettingsTabInfo` has no icon to render.
 */
export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  return (
    <>
      {SETTINGS_TABS.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            // Not `page`: these switch a panel in place and never change the
            // URL, so there is no current page for them to be.
            aria-current={isActive ? 'true' : undefined}
            className={sidebarRowClasses({ isActive })}
          >
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </>
  );
}
