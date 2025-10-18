export type StartPage = 'home' | 'my-drive';

export type UploadMethod = 'auto' | 'signed-url' | 'multipart' | 'multipart-concurrent';

export type BulkShareDuration = '1-hour' | '6-hours' | '1-day' | '3-days' | '7-days';

// Allow custom duration strings (e.g., "2-hours", "4-days", etc.)
export type BulkShareDurationValue = BulkShareDuration | string;

export interface GeneralSettings {
  startPage: StartPage;
  uploadMethod: UploadMethod;
  bulkShareDuration: BulkShareDurationValue;
}

export interface PrivacySettings {
  makeAccountPrivate: boolean;
  allowFileSharing: boolean;
  enableAnalytics: boolean;
  dataEncryption: boolean;
}

export interface UserSettings {
  general: GeneralSettings;
  privacy: PrivacySettings;
}

export type SettingsTab = 'general' | 'privacy';

export interface SettingsTabInfo {
  id: SettingsTab;
  label: string;
  description?: string;
}

export interface UploadMethodInfo {
  id: UploadMethod;
  label: string;
  description: string;
  performance?: 'fast' | 'faster' | 'fastest';
  computeUsage?: 'low' | 'medium' | 'high';
}
