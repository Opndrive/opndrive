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

/**
 * `makeAccountPrivate`, `allowFileSharing` and `dataEncryption` used to live
 * here alongside this. All four were persisted and read by nothing, and the
 * other three described features that do not exist, so they were removed
 * rather than left to look like working controls.
 *
 * `enableAnalytics` stays because it is about to mean something: it becomes
 * the opt-out that AnalyticsGate reads. It is deliberately still unwired, so
 * nothing renders it as a switch until it does.
 */
export interface PrivacySettings {
  enableAnalytics: boolean;
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
