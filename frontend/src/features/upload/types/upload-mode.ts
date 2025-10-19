// Upload mode types
export type UploadMode = 'multipart' | 'signed-url';

export interface UploadModeConfig {
  mode: UploadMode;
  label: string;
  description: string;
  features: {
    pauseResume: boolean;
    largeFiles: boolean;
    fasterSmallFiles: boolean;
  };
}

export const UPLOAD_MODES: Record<UploadMode, UploadModeConfig> = {
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
