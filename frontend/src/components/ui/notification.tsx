'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        const decrement = (100 / duration) * 50; // Update every 50ms
        return Math.max(0, prev - decrement);
      });
    }, 50);

    const timer = setTimeout(() => {
      handleClose();
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
    <div className={cn(baseStyles, typeStyles[type])} style={{ bottom: `${bottomPosition}px` }}>
      {/* Progress Bar */}
      <div className="h-1 w-full bg-black/10 dark:bg-white/10">
        <div
          className={cn('h-full transition-all duration-75 ease-linear', progressBarColors[type])}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex items-center p-4">
        <div className="flex-shrink-0 mr-3">{icons[type]}</div>
        <div className="flex-1 mr-2 font-medium">{message}</div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none transition-colors duration-200 rounded-full p-1 hover:bg-black/5 dark:hover:bg-white/5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
