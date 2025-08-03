'use client';

import type React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'danger',
}) => {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: 'bg-red-100 text-red-600',
          confirmButton: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
        };
      case 'warning':
        return {
          icon: 'bg-amber-100 text-amber-600',
          confirmButton: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
        };
      case 'info':
      default:
        return {
          icon: 'bg-[#3F8CFF]/10 text-[#3F8CFF]',
          confirmButton: 'bg-[#3F8CFF] hover:bg-[#3F8CFF]/90 focus:ring-[#3F8CFF]',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className="fixed inset-0 z-95 flex items-center justify-center bg-black/70">
      <div className="relative w-full max-w-md bg-white rounded-lg shadow-lg p-6 mx-4">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="mb-6 flex items-start">
          <div className={`mr-4 p-2 rounded-full ${styles.icon}`}>
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d={
                  variant === 'danger'
                    ? 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                    : 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                }
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
            <p className="mt-2 text-sm text-gray-500">{message}</p>
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button className={styles.confirmButton} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;
