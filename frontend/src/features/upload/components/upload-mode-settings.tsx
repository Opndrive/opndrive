'use client';

import React from 'react';
import { useUploadSettingsStore } from '@/features/upload/stores/use-upload-settings-store';
import { UPLOAD_MODES, UploadMode } from '@/features/upload/types';
import { Check, Upload, Zap } from 'lucide-react';

export const UploadModeSettings: React.FC = () => {
  const { uploadMode, setUploadMode } = useUploadSettingsStore();

  const handleModeChange = (mode: UploadMode) => {
    setUploadMode(mode);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {Object.values(UPLOAD_MODES).map((config) => {
          const isSelected = uploadMode === config.mode;
          const Icon = config.mode === 'multipart' ? Upload : Zap;

          return (
            <button
              key={config.mode}
              onClick={() => handleModeChange(config.mode)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-accent/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex-shrink-0 mt-0.5 ${
                    isSelected ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-foreground">{config.label}</h4>
                    {isSelected && (
                      <div className="flex-shrink-0">
                        <Check className="h-4 w-4 text-primary" />
                      </div>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mb-3">{config.description}</p>

                  <div className="flex flex-wrap gap-2">
                    {config.features.pauseResume && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium">
                        Pause/Resume
                      </span>
                    )}
                    {config.features.largeFiles && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium">
                        Large Files
                      </span>
                    )}
                    {config.features.fasterSmallFiles && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-medium">
                        Faster Small Files
                      </span>
                    )}
                    {!config.features.pauseResume && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-medium">
                        Cancel Only
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
        <h4 className="text-sm font-medium text-foreground mb-2">💡 Which should I choose?</h4>
        <ul className="space-y-2 text-sm text-muted-foreground">
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
