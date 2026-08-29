'use client';

import React from 'react';
import { useUploadSettingsStore } from '@/features/upload/stores/use-upload-settings-store';
import { DUPLICATE_POLICIES, DuplicatePolicy } from '@/features/upload/types';
import { HelpCircle, Copy, Replace } from 'lucide-react';
import { CustomRadioSelect, RadioOption } from '@/shared/components/custom-radio-select';

const ICONS: Record<DuplicatePolicy, React.ComponentType<{ className?: string }>> = {
  ask: HelpCircle,
  keepBoth: Copy,
  replace: Replace,
};

export const DuplicatePolicySettings: React.FC = () => {
  const { duplicatePolicy, setDuplicatePolicy } = useUploadSettingsStore();

  const options: RadioOption<DuplicatePolicy>[] = Object.values(DUPLICATE_POLICIES).map(
    (config) => ({
      value: config.policy,
      label: config.label,
      description: config.description,
      icon: ICONS[config.policy],
      tags:
        config.policy === 'replace'
          ? [{ label: 'Overwrites files', variant: 'warning' as const }]
          : [],
    })
  );

  return (
    <div className="space-y-4">
      <CustomRadioSelect
        options={options}
        value={duplicatePolicy}
        onChange={setDuplicatePolicy}
        name="duplicate-policy"
      />

      {duplicatePolicy === 'replace' && (
        // Worth saying beside the choice rather than only at the moment it
        // acts. A setting chosen once is not something anyone remembers weeks
        // later, watching files be overwritten without being asked.
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <p className="text-sm text-muted-foreground">
            Files with the same name will be overwritten without asking. Each drop that replaces
            something leaves a notice on the transfers card saying what happened.
          </p>
        </div>
      )}
    </div>
  );
};
