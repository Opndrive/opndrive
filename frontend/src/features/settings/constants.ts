import { SettingsTabInfo, UploadMethodInfo, StartPage } from './types';

export const SETTINGS_TABS: SettingsTabInfo[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Manage your basic preferences and upload settings',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    description: 'Control your privacy and data sharing preferences',
  },
];

export const UPLOAD_METHODS: UploadMethodInfo[] = [
  {
    id: 'auto',
    label: 'Auto',
    description:
      'Automatically selects the best upload method based on file size and network conditions',
  },
  {
    id: 'signed-url',
    label: 'Direct Upload',
    description: 'Upload files directly using signed URLs. Single request for entire file',
    performance: 'fast',
    computeUsage: 'low',
  },
  {
    id: 'multipart',
    label: 'Multipart Upload',
    description: 'Upload large files in multiple parts sequentially. Better for reliability',
    performance: 'faster',
    computeUsage: 'medium',
  },
  {
    id: 'multipart-concurrent',
    label: 'Concurrent Multipart',
    description: 'Upload file parts simultaneously. Fastest but uses more bandwidth and compute',
    performance: 'fastest',
    computeUsage: 'high',
  },
];

export const START_PAGE_OPTIONS: Array<{ value: StartPage; label: string; description: string }> = [
  {
    value: 'home',
    label: 'Home',
    description: 'Start with the main dashboard overview',
  },
  {
    value: 'my-drive',
    label: 'My Drive',
    description: 'Start directly in your file browser',
  },
];
