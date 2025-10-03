'use client';

import { UploadItem, OperationType } from '../types';
import { useUploadStore } from '../hooks/use-upload-store';

export interface OperationOptions {
  name: string;
  type: 'file' | 'folder';
  size: number;
  operation: OperationType;
  operationLabel?: string;
  destination?: string;
  extension?: string;
  totalFiles?: number;
}

export interface OperationProgress {
  itemId: string;
  progress: number;
  completedFiles?: number;
  totalFiles?: number;
}

class OperationsManager {
  private static instance: OperationsManager;
  private activeOperations = new Map<string, AbortController>();

  private constructor() {}

  static getInstance(): OperationsManager {
    if (!OperationsManager.instance) {
      OperationsManager.instance = new OperationsManager();
    }
    return OperationsManager.instance;
  }

  startOperation(options: OperationOptions): string {
    const { addUploadItem } = useUploadStore.getState();

    const itemId = addUploadItem({
      name: options.name,
      type: options.type,
      size: options.size,
      progress: 0,
      status: 'pending',
      destination: options.destination || '',
      extension: options.extension,
      operation: options.operation,
      operationLabel: options.operationLabel,
      totalFiles: options.totalFiles || 1,
      uploadedFiles: 0,
    });

    const abortController = new AbortController();
    this.activeOperations.set(itemId, abortController);

    return itemId;
  }

  updateProgress(update: OperationProgress): void {
    const { updateProgress } = useUploadStore.getState();
    updateProgress({
      itemId: update.itemId,
      progress: update.progress,
      uploadedFiles: update.completedFiles,
      totalFiles: update.totalFiles,
    });
  }

  updateStatus(itemId: string, status: UploadItem['status'], error?: string): void {
    const { updateItemStatus } = useUploadStore.getState();
    updateItemStatus(itemId, status, error);
  }

  updateSize(itemId: string, size: number, totalFiles?: number): void {
    const { updateItemSize } = useUploadStore.getState();
    updateItemSize(itemId, size, totalFiles);
  }

  setCalculatingSize(itemId: string, isCalculating: boolean): void {
    const { updateItemCalculatingSize } = useUploadStore.getState();
    updateItemCalculatingSize(itemId, isCalculating);
  }

  completeOperation(itemId: string): void {
    this.updateStatus(itemId, 'completed');
    this.activeOperations.delete(itemId);
  }

  failOperation(itemId: string, error: string): void {
    this.updateStatus(itemId, 'error', error);
    this.activeOperations.delete(itemId);
  }

  cancelOperation(itemId: string): void {
    const abortController = this.activeOperations.get(itemId);
    if (abortController) {
      abortController.abort();
      this.activeOperations.delete(itemId);
      this.updateStatus(itemId, 'cancelled');
    }
  }

  getAbortSignal(itemId: string): AbortSignal | undefined {
    return this.activeOperations.get(itemId)?.signal;
  }

  isOperationActive(itemId: string): boolean {
    return this.activeOperations.has(itemId);
  }
}

export const operationsManager = OperationsManager.getInstance();
