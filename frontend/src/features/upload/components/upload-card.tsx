'use client';

import React from 'react';
import { UploadOperationsCard } from './upload-operations-card';
import { DeleteOperationsCard } from './delete-operations-card';

export const UploadCard: React.FC = () => {
  return (
    <>
      <UploadOperationsCard />
      <DeleteOperationsCard />
    </>
  );
};
