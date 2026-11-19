'use client';

import React from 'react';
import { useUploadSettingsStore } from '@/features/upload/stores/use-upload-settings-store';
import { UPLOAD_MODES, UploadMode } from '@/features/upload/types';
import { Sparkles, Upload, Zap } from 'lucide-react';
import { CustomRadioSelect, RadioOption } from '@/shared/components/custom-radio-select';

export const UploadModeSettings: React.FC = () => {
  const { uploadMode, setUploadMode } = useUploadSettingsStore();

  // Convert UPLOAD_MODES config to RadioOption format
  const uploadModeOptions: RadioOption<UploadMode>[] = Object.values(UPLOAD_MODES).map(
    (config) => ({
      value: config.mode,
      label: config.label,
      description: config.description,
      icon: config.mode === 'auto' ? Sparkles : config.mode === 'multipart' ? Upload : Zap,
      tags: [
        ...(config.mode === 'auto' ? [{ label: 'Recommended', variant: 'primary' as const }] : []),
        ...(config.features.pauseResume === true
          ? [{ label: 'Pause/Resume', variant: 'success' as const }]
          : config.features.pauseResume === 'large-files'
            ? [{ label: 'Pause/Resume for large files', variant: 'success' as const }]
            : []),
        ...(config.features.largeFiles ? [{ label: 'Large Files', variant: 'info' as const }] : []),
        ...(config.features.fasterSmallFiles
          ? [{ label: 'Faster Small Files', variant: 'primary' as const }]
          : []),
        ...(!config.features.pauseResume
          ? [{ label: 'Cancel Only', variant: 'warning' as const }]
          : []),
      ],
    })
  );

  return (
    <div className="space-y-4">
      <CustomRadioSelect
        options={uploadModeOptions}
        value={uploadMode}
        onChange={setUploadMode}
        name="upload-mode"
      />

      <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
        <h4 className="text-sm font-medium text-foreground mb-2">💡 Which should I choose?</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="flex-shrink-0">•</span>
            <span>
              <strong>Auto:</strong> Picks for each file, using the size AWS recommends switching to
              multipart at. The right choice unless you need one method for everything.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0">•</span>
            <span>
              <strong>Multipart:</strong> Best for large files (&gt;100MB). Supports pause/resume.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0">•</span>
            <span>
              <strong>Signed URL:</strong> Faster for small files (&lt;100MB). Simpler, more direct.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
};
