// Upload mode types
export type UploadMode = 'auto' | 'multipart' | 'signed-url';

export interface UploadModeConfig {
  mode: UploadMode;
  label: string;
  description: string;
  features: {
    /** 'large-files': only the files Auto sends multipart. */
    pauseResume: boolean | 'large-files';
    largeFiles: boolean;
    fasterSmallFiles: boolean;
  };
}

/** In the order the settings list them: Auto first, as the one to pick. */
export const UPLOAD_MODES: Record<UploadMode, UploadModeConfig> = {
  auto: {
    mode: 'auto',
    label: 'Auto',
    description:
      'Picks for each file: a direct upload under 100 MB, multipart from 100 MB up. Large files can be paused.',
    features: {
      pauseResume: 'large-files',
      largeFiles: true,
      fasterSmallFiles: true,
    },
  },
  multipart: {
    mode: 'multipart',
    label: 'Multipart Upload',
    description: 'Advanced upload with pause/resume support. Best for large files.',
    features: {
      pauseResume: true,
      largeFiles: true,
      fasterSmallFiles: false,
    },
  },
  'signed-url': {
    mode: 'signed-url',
    label: 'Signed URL Upload',
    description: 'Simple direct upload. Faster for small files. Cancel only (no pause/resume).',
    features: {
      pauseResume: false,
      largeFiles: false,
      fasterSmallFiles: true,
    },
  },
};
