'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { FileItem } from '@/features/dashboard/types/file';
import { useNotification } from '@/context/notification-context';
import { useApiS3 } from '@/hooks/use-auth';

interface ShareDialogState {
  isOpen: boolean;
  file: FileItem | null;
  isGenerating: boolean;
}

interface ShareResult {
  url: string;
  expiresAt: Date;
}

interface ShareContextValue {
  shareDialog: ShareDialogState;
  openShareDialog: (file: FileItem) => void;
  closeShareDialog: () => void;
  generateShareLink: (durationInSeconds: number) => Promise<ShareResult | null>;
  copyToClipboard: (text: string) => Promise<boolean>;
  isGenerating: boolean;
}

const ShareContext = createContext<ShareContextValue | undefined>(undefined);

interface ShareProviderProps {
  children: ReactNode;
}

export const ShareProvider: React.FC<ShareProviderProps> = ({ children }) => {
  const apiS3 = useApiS3();

  const [shareDialog, setShareDialog] = useState<ShareDialogState>({
    isOpen: false,
    file: null,
    isGenerating: false,
  });

  const { success, error } = useNotification();

  const openShareDialog = useCallback((file: FileItem) => {
    console.log('Opening share dialog for file:', file.name);
    setShareDialog({
      isOpen: true,
      file,
      isGenerating: false,
    });
  }, []);

  const closeShareDialog = useCallback(() => {
    console.log('Closing share dialog');
    setShareDialog({
      isOpen: false,
      file: null,
      isGenerating: false,
    });
  }, []);

  const generateShareLink = useCallback(
    async (durationInSeconds: number): Promise<ShareResult | null> => {
      if (!shareDialog.file || !shareDialog.file.Key) {
        console.error('No file selected or file has no key');
        return null;
      }

      console.log(
        'Generating share link for:',
        shareDialog.file.name,
        'Duration:',
        durationInSeconds
      );
      setShareDialog((prev) => ({ ...prev, isGenerating: true }));

      try {
        const signedUrl = await apiS3.getSignedUrl({
          key: shareDialog.file.Key,
          expiryInSeconds: durationInSeconds,
        });

        const expiresAt = new Date(Date.now() + durationInSeconds * 1000);

        setShareDialog((prev) => ({ ...prev, isGenerating: false }));

        console.log('Share link generated successfully');
        return {
          url: signedUrl,
          expiresAt,
        };
      } catch (err) {
        console.error('Failed to generate share link:', err);
        error('Failed to generate share link. Please try again.');
        setShareDialog((prev) => ({ ...prev, isGenerating: false }));
        return null;
      }
    },
    [shareDialog.file, error]
  );

  const copyToClipboard = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        success('Link copied to clipboard!');
        return true;
      } catch (err) {
        console.error('Failed to copy to clipboard:', err);
        error('Failed to copy link to clipboard');
        return false;
      }
    },
    [success, error]
  );

  const value: ShareContextValue = {
    shareDialog,
    openShareDialog,
    closeShareDialog,
    generateShareLink,
    copyToClipboard,
    isGenerating: shareDialog.isGenerating,
  };

  return <ShareContext.Provider value={value}>{children}</ShareContext.Provider>;
};

export const useShare = (): ShareContextValue => {
  const context = useContext(ShareContext);
  if (context === undefined) {
    throw new Error('useShare must be used within a ShareProvider');
  }
  return context;
};
