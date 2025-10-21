import { SettingsTabInfo, UploadMethodInfo, StartPage, BulkShareDuration } from './types';

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

import { MdHomeFilled } from 'react-icons/md';
import { PiHardDrivesFill } from 'react-icons/pi';
import React from 'react';

export const START_PAGE_OPTIONS: Array<{
  value: StartPage;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: 'home',
    label: 'Home',
    description: 'Start with the main dashboard overview',
    icon: MdHomeFilled,
  },
  {
    value: 'my-drive',
    label: 'My Drive',
    description: 'Start directly in your file browser',
    icon: PiHardDrivesFill,
  },
];

export const BULK_SHARE_DURATION_OPTIONS: Array<{
  value: BulkShareDuration;
  label: string;
  description: string;
}> = [
  {
    value: '1-hour',
    label: '1 Hour',
    description: 'Links expire after 1 hour',
  },
  {
    value: '6-hours',
    label: '6 Hours',
    description: 'Links expire after 6 hours',
  },
  {
    value: '1-day',
    label: '1 Day',
    description: 'Links expire after 24 hours',
  },
  {
    value: '3-days',
    label: '3 Days',
    description: 'Links expire after 3 days',
  },
  {
    value: '7-days',
    label: '7 Days (Recommended)',
    description: 'Links expire after 7 days (Maximum allowed by S3)',
  },
];

// Helper function to convert duration to seconds
export function getDurationInSeconds(duration: string): number {
  // Handle predefined durations
  switch (duration) {
    case '1-hour':
      return 3600;
    case '6-hours':
      return 21600;
    case '1-day':
      return 86400;
    case '3-days':
      return 259200;
    case '7-days':
      return 604800;
  }

  // Handle custom duration format: "{number}-{unit}" (e.g., "2-hours", "4-days")
  const match = duration.match(/^(\d+)-(hour|hours|day|days)$/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];

    if (unit === 'hour' || unit === 'hours') {
      const seconds = value * 3600;
      // Maximum 7 days (604800 seconds)
      return Math.min(seconds, 604800);
    } else if (unit === 'day' || unit === 'days') {
      const seconds = value * 86400;
      // Maximum 7 days (604800 seconds)
      return Math.min(seconds, 604800);
    }
  }

  // Default to 7 days if parsing fails
  return 604800;
}

// Helper function to validate custom duration
export function isValidDuration(value: string): boolean {
  // Check if it's a predefined duration
  const predefined = ['1-hour', '6-hours', '1-day', '3-days', '7-days'];
  if (predefined.includes(value)) {
    return true;
  }

  // Check custom format: "{number}-{unit}"
  const match = value.match(/^(\d+)-(hour|hours|day|days)$/);
  if (match) {
    const num = parseInt(match[1]);
    const unit = match[2];
    const seconds = unit.startsWith('hour') ? num * 3600 : num * 86400;
    // Must be positive and not exceed 7 days
    return num > 0 && seconds <= 604800;
  }

  return false;
}

// Helper function to format duration label for display
export function formatDurationLabel(duration: string): string {
  switch (duration) {
    case '1-hour':
      return '1 Hour';
    case '6-hours':
      return '6 Hours';
    case '1-day':
      return '1 Day';
    case '3-days':
      return '3 Days';
    case '7-days':
      return '7 Days (Maximum)';
  }

  // Format custom duration
  const match = duration.match(/^(\d+)-(hour|hours|day|days)$/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];

    if (unit === 'hour' || unit === 'hours') {
      return `${value} ${value === 1 ? 'Hour' : 'Hours'}`;
    } else if (unit === 'day' || unit === 'days') {
      return `${value} ${value === 1 ? 'Day' : 'Days'}`;
    }
  }

  return duration;
}
