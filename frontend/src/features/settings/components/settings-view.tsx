'use client';

import { useSettings } from '../hooks/use-settings';
import { useSettingsContext } from '../context/settings-context';
import { GeneralSettingsPanel } from './general-settings-panel';
import { PrivacySettingsPanel } from './privacy-settings-panel';
import { SETTINGS_TABS } from '../constants';

export function SettingsView() {
  const { settings, isLoaded, updateGeneralSettings } = useSettings();
  const { activeTab } = useSettingsContext();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeTabInfo = SETTINGS_TABS.find((tab) => tab.id === activeTab);

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <GeneralSettingsPanel settings={settings.general} onUpdate={updateGeneralSettings} />
        );
      case 'privacy':
        return <PrivacySettingsPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8" key={activeTab}>
      {/* Page Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-semibold text-foreground">
          {activeTabInfo?.label || 'Settings'}
        </h1>
        {activeTabInfo?.description && (
          <p className="mt-2 text-muted-foreground">{activeTabInfo.description}</p>
        )}
      </div>

      {/* Settings Content */}
      <div className="max-w-2xl">{renderContent()}</div>
    </div>
  );
}
