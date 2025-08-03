import React from 'react';
import { SidebarStorageProps } from './types/sidebar';
import { formatBytes, calculateUsagePercentage } from './utils/sidebar';

export const SidebarStorage: React.FC<SidebarStorageProps> = ({
  used,
  total,
  onGetMoreStorage,
}) => {
  const usedFormatted = formatBytes(used * 1024 * 1024 * 1024);
  const totalFormatted = formatBytes(total * 1024 * 1024 * 1024);
  const percentage = calculateUsagePercentage(used, total);

  return (
    <div className="border-t border-border p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-secondary-foreground whitespace-nowrap">Storage</span>
          <span className="text-foreground font-medium whitespace-nowrap">{totalFormatted}</span>
        </div>

        <div className="w-full bg-accent rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="text-xs text-secondary-foreground whitespace-nowrap">
          {usedFormatted} of {totalFormatted} used
        </div>

        <button
          onClick={onGetMoreStorage}
          className="w-full text-sm text-primary border border-border rounded-full py-2 px-4 hover:bg-accent transition-colors"
        >
          Get more storage
        </button>
      </div>
    </div>
  );
};
