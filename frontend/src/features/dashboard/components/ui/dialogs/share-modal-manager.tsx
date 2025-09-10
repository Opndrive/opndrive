'use client';

import React from 'react';
import { ShareDialog } from './share-dialog';
import { useShare } from '@/context/share-context';

export const ShareModalManager: React.FC = () => {
  const { shareDialog, closeShareDialog } = useShare();

  return <ShareDialog isOpen={shareDialog.isOpen} onClose={closeShareDialog} />;
};
