'use client';

import { useCallback } from 'react';
import { useDriveStore } from '@/context/data-context';
import { useUploadStore } from '../stores/use-upload-store';
import { useNotification } from '@/context/notification-context';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import { useAuthGuard } from '@/hooks/use-auth-guard';

interface FolderContents {
  allKeys: string[];
  totalItems: number;
}

/**
 * S3 DeleteObjects responds 200 even when individual keys are rejected
 * (AccessDenied, object-lock retention, governance holds). Those failures come
 * back in an Errors array rather than as a thrown exception, so a batch delete
 * that silently drops objects looks identical to a successful one.
 *
 * @opndrive/s3-api 2.5.0 surfaces this as a DeleteBatchResult. The installed
 * 2.4.0 still types deleteBatch as Promise<void>, so these local types and the
 * normalizer below bridge the gap: against 2.4.0 we assume success (matching
 * today's behaviour exactly), and against 2.5.0 the real failures come through.
 *
 * Once frontend/package.json depends on ^2.5.0, delete these declarations and
 * import DeleteBatchError / DeleteBatchResult from '@opndrive/s3-api' instead.
 */
interface DeleteBatchError {
  key: string;
  versionId?: string;
  code?: string;
  message?: string;
}

interface DeleteBatchResult {
  requested: number;
  deleted: number;
  errors: DeleteBatchError[];
}

interface NormalizedDeleteResult extends DeleteBatchResult {
  /**
   * False when the provider reported no failure data at all, meaning `deleted`
   * is an assumption rather than a measurement. Callers must not present an
   * unreliable result as a verified deletion.
   */
  reliable: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Coerces one error entry field by field; never trusts the incoming shape. */
function toDeleteBatchError(raw: unknown): DeleteBatchError {
  const entry = (raw && typeof raw === 'object' ? raw : {}) as Partial<DeleteBatchError>;
  return {
    key: typeof entry.key === 'string' ? entry.key : '',
    versionId: typeof entry.versionId === 'string' ? entry.versionId : undefined,
    code: typeof entry.code === 'string' ? entry.code : undefined,
    message: typeof entry.message === 'string' ? entry.message : undefined,
  };
}

/**
 * Pure - no logging or side effects, so it stays trivially testable. Callers
 * are responsible for reacting to `reliable === false`.
 */
function normalizeDeleteResult(raw: unknown, requested: number): NormalizedDeleteResult {
  const rawErrors =
    raw && typeof raw === 'object' ? (raw as Partial<DeleteBatchResult>).errors : undefined;

  if (!Array.isArray(rawErrors)) {
    // Pre-2.5.0 resolves with undefined. No failure data exists, so preserve the
    // historical assumption of success but mark it unverified.
    return { requested, deleted: requested, errors: [], reliable: false };
  }

  const candidate = raw as Partial<DeleteBatchResult>;
  const errors = rawErrors.map(toDeleteBatchError);

  return {
    requested: isFiniteNumber(candidate.requested) ? candidate.requested : requested,
    deleted: isFiniteNumber(candidate.deleted)
      ? candidate.deleted
      : Math.max(0, requested - errors.length),
    errors,
    reliable: true,
  };
}

let warnedAboutLegacyProvider = false;

/** Fires once per session so an inert fix cannot stay invisible. */
function warnLegacyProviderOnce(): void {
  if (warnedAboutLegacyProvider) return;
  warnedAboutLegacyProvider = true;
  console.warn(
    '[opndrive] The installed @opndrive/s3-api predates 2.5.0, so deleteBatch ' +
      'reports no per-object failures. Partial deletes cannot be detected and ' +
      'will be shown as fully successful. Upgrade to ^2.5.0.'
  );
}

/** An abort the existing `error.name === "AbortError"` guards will recognise. */
function abortError(): Error {
  const err = new Error('Operation cancelled');
  err.name = 'AbortError';
  return err;
}

/** Raised when a delete finished but S3 refused some of the objects. */
class PartialDeleteError extends Error {
  readonly failures: DeleteBatchError[];

  constructor(message: string, failures: DeleteBatchError[]) {
    super(message);
    this.name = 'PartialDeleteError';
    this.failures = failures;
  }
}

function describeFailures(failures: DeleteBatchError[], total: number): string {
  const headline = `${failures.length} of ${total} object(s) could not be deleted.`;
  const first = failures[0];
  if (!first) return headline;

  const parts = [first.key || '(unknown key)'];
  if (first.versionId) parts.push(`version ${first.versionId}`);
  if (first.code) parts.push(first.code);
  if (first.message) parts.push(first.message);

  return `${headline} First failure: ${parts.join(' - ')}`;
}

export function useDeleteOperations() {
  const { apiS3 } = useAuthGuard();
  const { refreshCurrentData } = useDriveStore();
  const { error: errorFunction } = useNotification();
  const {
    addDeleteOperation,
    updateDeleteProgress,
    setCalculatingSize,
    updateSize,
    completeDeleteOperation,
    failDeleteOperation,
    cancelDeleteOperation,
  } = useUploadStore();

  // Helper function to directly fetch all S3 objects with a prefix using AWS SDK
  const getAllS3ObjectsWithPrefix = useCallback(
    async (folderPrefix: string): Promise<FolderContents> => {
      if (!apiS3) {
        throw new Error('API not ready');
      }

      const allKeys = await apiS3.listFromPrefix(folderPrefix);

      return {
        allKeys: allKeys,
        totalItems: allKeys.length,
      };
    },
    [apiS3]
  );

  const deleteFileWithProgress = useCallback(
    async (file: FileItem): Promise<void> => {
      if (!apiS3) {
        throw new Error('API not ready');
      }

      const itemId = `delete-file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const abortController = new AbortController();

      addDeleteOperation(itemId, {
        id: itemId,
        name: file.name,
        type: 'file',
        size: file.size?.value || 0,
        status: 'deleting',
        progress: 0,
        operationLabel: 'Deleting file',
        extension: file.extension,
        abortController,
      });

      try {
        updateDeleteProgress(itemId, 0);

        if (abortController.signal.aborted) {
          throw abortError();
        }

        // Show intermediate progress
        updateDeleteProgress(itemId, 20);

        // Perform the actual delete
        await apiS3.deleteFile(file.Key || file.name);

        updateDeleteProgress(itemId, 90);

        // Small delay to show progress
        await new Promise((resolve) => setTimeout(resolve, 100));

        updateDeleteProgress(itemId, 100);
        completeDeleteOperation(itemId);

        await refreshCurrentData();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        const errorMessage = error instanceof Error ? error.message : 'Delete failed';
        failDeleteOperation(itemId, errorMessage);
        errorFunction(`Failed to delete "${file.name}": ${errorMessage}`);
        throw error;
      }
    },
    [
      apiS3,
      refreshCurrentData,
      errorFunction,
      addDeleteOperation,
      updateDeleteProgress,
      completeDeleteOperation,
      failDeleteOperation,
    ]
  );

  const deleteFolderWithProgress = useCallback(
    async (folder: Folder): Promise<void> => {
      if (!apiS3) {
        throw new Error('API not ready');
      }

      // Create the operation with loading state for size calculation
      const itemId = `delete-folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const abortController = new AbortController();

      addDeleteOperation(itemId, {
        id: itemId,
        name: folder.name,
        type: 'folder',
        size: 0, // Will be updated after we fetch contents
        status: 'deleting',
        progress: 0,
        operationLabel: 'Deleting folder',
        abortController,
      });

      try {
        // Show loading state for size calculation
        setCalculatingSize(itemId, true);
        updateDeleteProgress(itemId, 0);

        if (abortController.signal.aborted) {
          throw abortError();
        }

        // Get all folder contents using direct S3 API call
        const folderKey = folder.Prefix || folder.name;
        const normalizedKey = folderKey.endsWith('/') ? folderKey : `${folderKey}/`;

        const folderContents = await getAllS3ObjectsWithPrefix(normalizedKey);

        // Update operation with actual file count, hide loading state
        setCalculatingSize(itemId, false);
        updateSize(itemId, 0, folderContents.totalItems); // Size calculation not needed for delete
        updateDeleteProgress(itemId, 5); // Small progress after calculation

        if (abortController.signal.aborted) {
          throw abortError();
        }

        // Get all keys (files and folders) to delete
        const allKeys = folderContents.allKeys;

        // Add the main folder if it's not already in the list
        if (!allKeys.includes(normalizedKey)) {
          allKeys.push(normalizedKey);
        }

        if (allKeys.length > 0) {
          // Use batch delete for better performance (S3 allows up to 1000 objects per batch)
          const batchSize = 1000;
          let processed = 0;
          let deletedCount = 0;
          const failures: DeleteBatchError[] = [];

          for (let i = 0; i < allKeys.length; i += batchSize) {
            if (abortController.signal.aborted) {
              throw abortError();
            }

            const batch = allKeys.slice(i, i + batchSize);

            // Use batch delete to delete multiple objects at once
            const result = normalizeDeleteResult(
              await apiS3.deleteBatch(batch.map((key) => ({ Key: key }))),
              batch.length
            );
            if (!result.reliable) warnLegacyProviderOnce();

            // Keep going after a partial failure - bailing out here would
            // strand more objects than it saves. Everything is reported below.
            processed += batch.length;
            deletedCount += result.deleted;
            failures.push(...result.errors);

            // Drive the bar off `processed` so it never stalls on a failing
            // chunk, but report the true deleted count alongside it.
            const progress = 5 + (processed / allKeys.length) * 90;
            updateDeleteProgress(itemId, progress, deletedCount, allKeys.length);
          }

          // A cancel landing after the final chunk is a cancellation, not a
          // partial failure.
          if (abortController.signal.aborted) {
            throw abortError();
          }

          if (failures.length > 0) {
            const summary = describeFailures(failures, allKeys.length);
            failDeleteOperation(itemId, summary);
            errorFunction(`Partially deleted "${folder.name}": ${summary}`);
            // Refresh so the browser reflects what actually survived.
            await refreshCurrentData();
            throw new PartialDeleteError(summary, failures);
          }
        } else {
          // Empty folder, just delete the folder itself using single delete
          await apiS3.deleteFile(normalizedKey);
          updateDeleteProgress(itemId, 95);
        }

        // Small delay to show final progress
        await new Promise((resolve) => setTimeout(resolve, 100));

        updateDeleteProgress(itemId, 100);
        completeDeleteOperation(itemId);

        await refreshCurrentData();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        // Partial failures already reported their own detail above.
        if (error instanceof PartialDeleteError) {
          throw error;
        }
        const errorMessage = error instanceof Error ? error.message : 'Delete failed';
        failDeleteOperation(itemId, errorMessage);
        errorFunction(`Failed to delete "${folder.name}": ${errorMessage}`);
        throw error;
      }
    },
    [
      apiS3,
      refreshCurrentData,
      errorFunction,
      getAllS3ObjectsWithPrefix,
      addDeleteOperation,
      setCalculatingSize,
      updateDeleteProgress,
      updateSize,
      completeDeleteOperation,
      failDeleteOperation,
    ]
  );

  const batchDelete = useCallback(
    async (items: FileItem[]): Promise<void> => {
      if (!apiS3) {
        throw new Error('API not ready');
      }

      if (items.length === 0) {
        return;
      }

      const itemId = `delete-batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const abortController = new AbortController();

      // Determine batch operation details
      const fileCount = items.filter((item) => 'Key' in item).length;
      const folderCount = items.length - fileCount;
      const operationLabel =
        folderCount > 0 && fileCount > 0
          ? `Deleting ${fileCount} file${fileCount !== 1 ? 's' : ''} and ${folderCount} folder${folderCount !== 1 ? 's' : ''}`
          : folderCount > 0
            ? `Deleting ${folderCount} folder${folderCount !== 1 ? 's' : ''}`
            : `Deleting ${fileCount} file${fileCount !== 1 ? 's' : ''}`;

      addDeleteOperation(itemId, {
        id: itemId,
        name: `${items.length} item${items.length !== 1 ? 's' : ''}`,
        type: 'folder', // Use folder icon for batch operations
        size: 0,
        status: 'deleting',
        progress: 0,
        operationLabel,
        abortController,
      });

      try {
        // Show calculating state
        setCalculatingSize(itemId, true);
        updateDeleteProgress(itemId, 0);

        if (abortController.signal.aborted) {
          throw abortError();
        }

        // Collect all keys to delete (including folder contents)
        const allKeysToDelete: string[] = [];

        for (const item of items) {
          if (abortController.signal.aborted) {
            throw abortError();
          }

          if ('Key' in item) {
            // It's a file
            allKeysToDelete.push(item.Key || item.name);
          }
        }

        // Remove duplicates
        const uniqueKeys = Array.from(new Set(allKeysToDelete));
        const totalItems = uniqueKeys.length;

        // Update with actual count
        setCalculatingSize(itemId, false);
        updateSize(itemId, 0, totalItems);
        updateDeleteProgress(itemId, 5);

        if (abortController.signal.aborted) {
          throw abortError();
        }

        if (uniqueKeys.length === 0) {
          updateDeleteProgress(itemId, 100);
          completeDeleteOperation(itemId);
          await refreshCurrentData();
          return;
        }

        // Batch delete in chunks of 1000 (S3 limit)
        const batchSize = 1000;
        let processed = 0;
        let deletedCount = 0;
        const failures: DeleteBatchError[] = [];

        for (let i = 0; i < uniqueKeys.length; i += batchSize) {
          if (abortController.signal.aborted) {
            throw abortError();
          }

          const batch = uniqueKeys.slice(i, i + batchSize);

          // Delete batch
          const result = normalizeDeleteResult(
            await apiS3.deleteBatch(batch.map((key) => ({ Key: key }))),
            batch.length
          );
          if (!result.reliable) warnLegacyProviderOnce();

          processed += batch.length;
          deletedCount += result.deleted;
          failures.push(...result.errors);

          // Progress from 5% to 95%
          const progress = 5 + (processed / uniqueKeys.length) * 90;
          updateDeleteProgress(itemId, progress, deletedCount, uniqueKeys.length);
        }

        if (abortController.signal.aborted) {
          throw abortError();
        }

        if (failures.length > 0) {
          const summary = describeFailures(failures, uniqueKeys.length);
          failDeleteOperation(itemId, summary);
          errorFunction(`Partially deleted selection: ${summary}`);
          await refreshCurrentData();
          throw new PartialDeleteError(summary, failures);
        }

        // Small delay to show final progress
        await new Promise((resolve) => setTimeout(resolve, 100));

        updateDeleteProgress(itemId, 100);
        completeDeleteOperation(itemId);

        await refreshCurrentData();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (error instanceof PartialDeleteError) {
          throw error;
        }
        const errorMessage = error instanceof Error ? error.message : 'Batch delete failed';
        failDeleteOperation(itemId, errorMessage);
        errorFunction(`Failed to delete items: ${errorMessage}`);
        throw error;
      }
    },
    [
      apiS3,
      refreshCurrentData,
      errorFunction,
      getAllS3ObjectsWithPrefix,
      addDeleteOperation,
      setCalculatingSize,
      updateDeleteProgress,
      updateSize,
      completeDeleteOperation,
      failDeleteOperation,
    ]
  );

  const batchDeleteByKeys = useCallback(
    async (keys: string[]): Promise<void> => {
      if (!apiS3) {
        throw new Error('API not ready');
      }

      if (keys.length === 0) {
        return;
      }

      // Duplicates would inflate the requested count and skew `deleted`, which
      // is derived as requested minus errors.
      const uniqueKeys = Array.from(new Set(keys));

      const itemId = `delete-keys-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const abortController = new AbortController();

      addDeleteOperation(itemId, {
        id: itemId,
        name: `${uniqueKeys.length} item${uniqueKeys.length !== 1 ? 's' : ''}`,
        type: 'folder',
        size: 0,
        status: 'deleting',
        progress: 0,
        totalFiles: uniqueKeys.length,
        operationLabel: `Deleting ${uniqueKeys.length} item${uniqueKeys.length !== 1 ? 's' : ''}`,
        abortController,
      });

      try {
        updateDeleteProgress(itemId, 0, 0, uniqueKeys.length);

        if (abortController.signal.aborted) {
          throw abortError();
        }

        // Batch delete in chunks of 1000 (S3 limit)
        const batchSize = 1000;
        let processed = 0;
        let deletedCount = 0;
        const failures: DeleteBatchError[] = [];

        for (let i = 0; i < uniqueKeys.length; i += batchSize) {
          if (abortController.signal.aborted) {
            throw abortError();
          }

          const batch = uniqueKeys.slice(i, i + batchSize);

          // Delete batch
          const result = normalizeDeleteResult(
            await apiS3.deleteBatch(batch.map((key) => ({ Key: key }))),
            batch.length
          );
          if (!result.reliable) warnLegacyProviderOnce();

          processed += batch.length;
          deletedCount += result.deleted;
          failures.push(...result.errors);

          const progress = (processed / uniqueKeys.length) * 100;
          updateDeleteProgress(itemId, progress, deletedCount, uniqueKeys.length);
        }

        if (abortController.signal.aborted) {
          throw abortError();
        }

        if (failures.length > 0) {
          const summary = describeFailures(failures, uniqueKeys.length);
          failDeleteOperation(itemId, summary);
          errorFunction(`Partially deleted items: ${summary}`);
          await refreshCurrentData();
          throw new PartialDeleteError(summary, failures);
        }

        completeDeleteOperation(itemId);
        await refreshCurrentData();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        if (error instanceof PartialDeleteError) {
          throw error;
        }
        const errorMessage = error instanceof Error ? error.message : 'Batch delete failed';
        failDeleteOperation(itemId, errorMessage);
        errorFunction(`Failed to delete items: ${errorMessage}`);
        throw error;
      }
    },
    [
      apiS3,
      refreshCurrentData,
      errorFunction,
      addDeleteOperation,
      updateDeleteProgress,
      completeDeleteOperation,
      failDeleteOperation,
    ]
  );

  const cancelDelete = useCallback(
    (itemId: string) => {
      cancelDeleteOperation(itemId);
    },
    [cancelDeleteOperation]
  );

  return {
    deleteFileWithProgress,
    deleteFolderWithProgress,
    batchDelete,
    batchDeleteByKeys,
    cancelDelete,
  };
}
