'use client';

import { GeneralSettings } from '../types';
import { UPLOAD_METHODS, START_PAGE_OPTIONS } from '../constants';
import { RadioGroup } from './radio-group';

interface GeneralSettingsPanelProps {
  settings: GeneralSettings;
  onUpdate: (settings: Partial<GeneralSettings>) => void;
}

export function GeneralSettingsPanel({ settings, onUpdate }: GeneralSettingsPanelProps) {
  const uploadOptions = UPLOAD_METHODS.map((method) => ({
    value: method.id,
    label: method.label,
    description: method.description,
    badge:
      method.performance && method.computeUsage
        ? `${method.performance} • ${method.computeUsage} compute`
        : undefined,
  }));

  const startPageOptions = START_PAGE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.description,
  }));

  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <div className="border-b border-border pb-4">
          <h3 className="text-lg font-medium text-foreground">Start page</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which page to display when you open OpnDrive
          </p>
        </div>
        <div className="pl-0">
          <RadioGroup
            value={settings.startPage}
            onValueChange={(value) => onUpdate({ startPage: value })}
            options={startPageOptions}
            name="startPage"
          />
        </div>
      </div>

      <div className="space-y-6">
        <div className="border-b border-border pb-4">
          <h3 className="text-lg font-medium text-foreground">Upload method</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Select your preferred file upload strategy. This affects upload speed and resource
            usage.
          </p>
        </div>
        <div className="pl-0">
          <RadioGroup
            value={settings.uploadMethod}
            onValueChange={(value) => onUpdate({ uploadMethod: value })}
            options={uploadOptions}
            name="uploadMethod"
          />
        </div>
      </div>
    </div>
  );
}
