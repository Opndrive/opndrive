'use client';

import type React from 'react';
import { useState, useEffect, useEffectEvent } from 'react';
import { X, CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/utils/utils';
import { AriaLabel } from '@/shared/components/custom-aria-label';

// Simplified props
export interface NotificationProps {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
  index: number;
  onClose?: (id: string) => void;
}

export const Notification: React.FC<NotificationProps> = ({
  id,
  type,
  message,
  duration = 2500,
  index,
  onClose,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(100);

  // An effect event, so the timer below runs once per duration and still
  // calls the latest onClose, rather than restarting whenever the parent
  // hands down a new callback.
  const closeWhenDue = useEffectEvent(() => handleClose());

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const decrement = (100 / duration) * 50; // Update every 50ms
        return Math.max(0, prev - decrement);
      });
    }, 50);

    const timer = setTimeout(() => {
      closeWhenDue();
    }, duration);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose?.(id);
    }, 300); // Match animation duration
  };

  // Simplified icons object
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  };

  const baseStyles = cn(
    'fixed right-4 flex flex-col rounded-xl shadow-2xl max-w-sm z-50 overflow-hidden border backdrop-blur-sm transition-all duration-300 ease-in-out',
    isExiting ? 'translate-x-full opacity-0 scale-95' : 'translate-x-0 opacity-100 scale-100'
  );

  // Simplified styles object
  const typeStyles = {
    success:
      'bg-emerald-50/95 text-emerald-900 border-emerald-200 dark:bg-emerald-950/95 dark:text-emerald-100 dark:border-emerald-800',
    error:
      'bg-red-50/95 text-red-900 border-red-200 dark:bg-red-950/95 dark:text-red-100 dark:border-red-800',
    info: 'bg-blue-50/95 text-blue-900 border-blue-200 dark:bg-blue-950/95 dark:text-blue-100 dark:border-blue-800',
    warning:
      'bg-amber-50/95 text-amber-900 border-amber-200 dark:bg-amber-950/95 dark:text-amber-100 dark:border-amber-800',
  };

  // Simplified progress bar colors
  const progressBarColors = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-amber-500',
  };

  const bottomPosition = 16 + index * 80; // Stack notifications from the bottom

  return (
    <div
      className={cn(baseStyles, typeStyles[type])}
      style={{ bottom: `${bottomPosition}px` }}
      // Read out when it appears: an error interrupts, anything else waits its
      // turn. Without this a screen reader heard none of these, and a failed
      // switch or delete looked to its user like nothing had happened.
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      {/* Progress Bar */}
      <div className="h-1 w-full bg-black/10 dark:bg-white/10" aria-hidden="true">
        <div
          className={cn('h-full transition-all duration-75 ease-linear', progressBarColors[type])}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex items-center p-4">
        <div className="flex-shrink-0 mr-3" aria-hidden="true">
          {icons[type]}
        </div>
        <div className="flex-1 mr-2 font-medium">{message}</div>
        {/* The tooltip is for the eye; aria-label is what a screen reader reads.
            Both came from the second copy of this component, deleted in #70. */}
        <AriaLabel label="Close notification" position="top">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close notification"
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none transition-colors duration-200 rounded-full p-1 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </AriaLabel>
      </div>
    </div>
  );
};
