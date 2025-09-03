export type StartPage = 'home' | 'my-drive';

export type UploadMethod = 'auto' | 'signed-url' | 'multipart' | 'multipart-concurrent';

export interface GeneralSettings {
  startPage: StartPage;
  uploadMethod: UploadMethod;
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
