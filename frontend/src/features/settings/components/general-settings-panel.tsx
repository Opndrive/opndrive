'use client';

import { GeneralSettings } from '../types';
import { START_PAGE_OPTIONS, BULK_SHARE_DURATION_OPTIONS, isValidDuration } from '../constants';
import { RadioGroup } from './radio-group';
import { CustomDropdown } from '@/shared/components/ui/custom-dropdown';

interface GeneralSettingsPanelProps {
  settings: GeneralSettings;
  onUpdate: (settings: Partial<GeneralSettings>) => void;
}

export function GeneralSettingsPanel({ settings, onUpdate }: GeneralSettingsPanelProps) {
  const startPageOptions = START_PAGE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    description: option.description,
  }));

  const bulkShareDurationDropdownOptions = BULK_SHARE_DURATION_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));

  const handleDurationChange = (value: string) => {
    if (isValidDuration(value)) {
      onUpdate({ bulkShareDuration: value });
    }
  };

  return (
    <div className="space-y-12">
      <div className="space-y-6">
        <div className="border-b border-border pb-4">
          <h3 className="text-lg font-medium text-foreground">Start page</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which page to display when you open Opndrive
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
          <h3 className="text-lg font-medium text-foreground">Bulk file share duration</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Set the default expiration time for share links when sharing multiple files. Maximum
            allowed by S3 is 7 days. You can also set a custom duration.
          </p>
        </div>
        <div className="pl-0 max-w-md">
          <CustomDropdown
            options={bulkShareDurationDropdownOptions}
            value={settings.bulkShareDuration}
            onChange={handleDurationChange}
            placeholder="Select duration"
            allowCustomValue={true}
            customValuePlaceholder="e.g., 2-hours or 5-days"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Custom format: <code className="px-1 py-0.5 bg-muted rounded">number-hours</code> or{' '}
            <code className="px-1 py-0.5 bg-muted rounded">number-days</code>
            <br />
            Examples: <span className="text-foreground">2-hours</span>,{' '}
            <span className="text-foreground">12-hours</span>,{' '}
            <span className="text-foreground">5-days</span>
            <br />
            Maximum: 7 days (168 hours)
          </p>
        </div>
      </div>
    </div>
  );
}
