'use client';

import { useCallback } from 'react';
import { useDriveStore, type Revert } from '@/context/data-context';
import { SESSION_ENDED, useUploadStore } from '../stores/use-upload-store';
import { useDeleteRecoveryStore } from '../stores/use-delete-recovery-store';
import { useNotification } from '@/context/notification-context';
import { useDeletedFolderCleanup } from './use-deleted-folder-cleanup';
import { markerLast } from '../utils/delete-key-order';
import type { FileItem } from '@/features/dashboard/types/file';
import type { Folder } from '@/features/dashboard/types/folder';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { isFile, isFolderLike } from '@/shared/utils/drive-item';

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

/**
 * How many failed objects to name before falling back to a count.
 *
 * This string is rendered on a card, and a failed batch can run to hundreds.
 */
const MAX_NAMED_FAILURES = 3;

/**
 * What went wrong, in the words S3 used.
 *
 * Every one of these failures arrives inside the same DeleteObjects response
 * that did the deleting - S3 returns per-object errors inline - so naming them
 * costs nothing. The alternative, asking afterwards whether each object is
 * still there, would be one HEAD request per object.
 */
function describeFailures(failures: DeleteBatchError[], total: number): string {
  const headline = `${failures.length} of ${total} object(s) could not be deleted.`;
  if (failures.length === 0) return headline;

  const named = failures.slice(0, MAX_NAMED_FAILURES).map((failure) => {
    const parts = [failure.key || '(unknown key)'];
    if (failure.versionId) parts.push(`version ${failure.versionId}`);
    if (failure.code) parts.push(failure.code);
    // Only when there is one, otherwise three S3 messages make an unreadable
    // wall of text out of a line that has to fit on a card.
    if (failures.length === 1 && failure.message) parts.push(failure.message);
    return parts.join(' - ');
  });

  const remaining = failures.length - named.length;
  const more = remaining > 0 ? `; and ${remaining} more` : '';

  return `${headline} ${named.join('; ')}${more}`;
}

/**
 * How many names the tooltip lists before the rest become a count.
 *
 * The tooltip is not scrollable - it is pointer-transparent by design, so
 * nothing can reach a scrollbar inside it. A cap is what keeps a selection of
 * four hundred from running off the screen.
 */
const MAX_NAMED_ITEMS = 12;

/** The name to show for an item, falling back to the last segment of its key. */
function displayName(item: FileItem | Folder): string {
  if (item.name) return item.name;

  // A folder marker's name comes out empty: enrichFile splits its key on '/'
  // and a key ending in one leaves nothing after the final separator.
  const key = 'Prefix' in item ? item.Prefix : 'Key' in item ? item.Key : undefined;
  return typeof key === 'string' ? (key.split('/').filter(Boolean).pop() ?? key) : '';
}

function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf('.');
  // `<= 0` rather than `=== -1`, so a dotfile is not read as being all suffix.
  return dot <= 0 ? undefined : name.slice(dot + 1).toLowerCase();
}

/**
 * The extension every name shares, when they share one.
 *
 * Eight .json files have an obvious icon and should get it. Eight files of
 * different kinds have no single icon that would not be a lie about seven of
 * them, so they get the stacked one instead.
 */
function sharedExtension(names: string[]): string | undefined {
  const first = extensionOf(names[0] ?? '');
  if (!first) return undefined;

  return names.every((name) => extensionOf(name) === first) ? first : undefined;
}

/**
 * What is in the selection, one name per line.
 *
 * These are the items the caller already handed us, so this costs nothing.
 * "8 items" is true and useless - it does not tell you whether the eight you
 * selected are the eight you meant.
 *
 * Newline-separated rather than an array because the operations panel memoises
 * each row on shallow-equal props: an array rebuilt every render would defeat
 * that for every row at once, which is the regression OperationRow's own doc
 * comment exists to warn about. The tooltip renders the breaks.
 */
function describeItems(names: string[]): string | undefined {
  if (names.length <= 1) return undefined;

  const usable = names.filter(Boolean);
  if (usable.length === 0) return undefined;

  const listed = usable.slice(0, MAX_NAMED_ITEMS);
  const remaining = usable.length - listed.length;

  return remaining > 0 ? `${listed.join('\n')}\nand ${remaining} more` : listed.join('\n');
}

export function useDeleteOperations() {
  const { apiS3 } = useAuthGuard();
  const refreshCurrentData = useDriveStore((state) => state.refreshCurrentData);
  const removeFiles = useDriveStore((state) => state.removeFiles);
  const { error: errorFunction } = useNotification();
  const {
    startDeleteOperation,
    updateDeleteProgress,
    setCalculatingSize,
    updateSize,
    completeDeleteOperation,
    failDeleteOperation,
    cancelDeleteOperation,
  } = useUploadStore();
  // Selected one at a time on purpose. A bare useDeleteRecoveryStore() would
  // subscribe every consumer of this hook to every record change, which is the
  // re-render problem tracked in #106.
  const recordStarted = useDeleteRecoveryStore((state) => state.recordStarted);
  const clearRecord = useDeleteRecoveryStore((state) => state.clearRecord);
  const cleanUpDeletedFolder = useDeletedFolderCleanup();

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
      const signal = startDeleteOperation(itemId, {
        id: itemId,
        name: file.name,
        type: 'file',
        size: file.size?.value || 0,
        status: 'deleting',
        progress: 0,
        operationLabel: 'Deleting file',
        extension: file.extension,
      });

      try {
        updateDeleteProgress(itemId, 0);

        if (signal.aborted) {
          throw abortError();
        }

        // Show intermediate progress
        updateDeleteProgress(itemId, 20);

        // The row goes now rather than when S3 answers. Everything below is
        // careful about who may put it back: only a failure of the one call
        // this function makes leaves the object provably still there.
        const undoRemoval = removeFiles([file.Key || file.name]);

        try {
          // Perform the actual delete
          await apiS3.deleteFile(file.Key || file.name);
        } catch (error) {
          // One call, one object: it either happened or it did not, so the row
          // belongs back exactly as it was. Note this is deliberately not the
          // outer catch, which also sees aborts raised *after* the delete
          // succeeded - putting the row back there would resurrect a file that
          // really is gone.
          undoRemoval();
          throw error;
        }

        updateDeleteProgress(itemId, 90);

        // Small delay to show progress
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Logout aborts every running delete. Arriving here after that must not
        // report success or refresh the browser through the signed-out client.
        if (signal.aborted) {
          throw abortError();
        }

        updateDeleteProgress(itemId, 100);
        completeDeleteOperation(itemId);
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
      removeFiles,
      errorFunction,
      startDeleteOperation,
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
      const signal = startDeleteOperation(itemId, {
        id: itemId,
        name: folder.name,
        type: 'folder',
        size: 0, // Will be updated after we fetch contents
        status: 'deleting',
        progress: 0,
        operationLabel: 'Deleting folder',
      });

      try {
        // Show loading state for size calculation
        setCalculatingSize(itemId, true);
        updateDeleteProgress(itemId, 0);

        if (signal.aborted) {
          throw abortError();
        }

        // Get all folder contents using direct S3 API call
        const folderKey = folder.Prefix || folder.name;
        const normalizedKey = folderKey.endsWith('/') ? folderKey : `${folderKey}/`;

        const folderContents = await getAllS3ObjectsWithPrefix(normalizedKey);

        if (signal.aborted) {
          throw abortError();
        }

        // Update operation with actual file count, hide loading state
        setCalculatingSize(itemId, false);
        updateSize(itemId, 0, folderContents.totalItems); // Size calculation not needed for delete
        updateDeleteProgress(itemId, 5); // Small progress after calculation

        if (signal.aborted) {
          throw abortError();
        }

        // The folder's own marker object goes last, always. See markerLast.
        const allKeys = markerLast(folderContents.allKeys, normalizedKey);

        // Write down that this folder is being deleted before the first batch
        // goes out. The finally below clears it as soon as we report anything,
        // so a record that is still here on the next load can only mean the
        // run was cut off without telling anyone.
        recordStarted({
          id: itemId,
          bucket: apiS3.getBucketName(),
          prefix: normalizedKey,
          name: folder.name,
          totalItems: allKeys.length,
          startedAt: Date.now(),
        });

        if (allKeys.length > 0) {
          // Use batch delete for better performance (S3 allows up to 1000 objects per batch)
          const batchSize = 1000;
          let processed = 0;
          let deletedCount = 0;
          const failures: DeleteBatchError[] = [];

          for (let i = 0; i < allKeys.length; i += batchSize) {
            if (signal.aborted) {
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
          if (signal.aborted) {
            throw abortError();
          }

          if (failures.length > 0) {
            const summary = describeFailures(failures, allKeys.length);
            failDeleteOperation(itemId, summary);
            errorFunction(`Partially deleted "${folder.name}": ${summary}`);
            // Some objects went and some did not, and only the bucket knows
            // which. Silently, because those rows are on screen and asking is
            // no reason to blank them.
            await refreshCurrentData({ silent: true });
            throw new PartialDeleteError(summary, failures);
          }
        } else {
          // Empty folder, just delete the folder itself using single delete
          await apiS3.deleteFile(normalizedKey);
          updateDeleteProgress(itemId, 95);
        }

        // Small delay to show final progress
        await new Promise((resolve) => setTimeout(resolve, 100));

        // The delay above is another window for a logout to land in, and the
        // loop's own check happened before it.
        if (signal.aborted) {
          throw abortError();
        }

        updateDeleteProgress(itemId, 100);
        completeDeleteOperation(itemId);

        // Every listing that mentioned this folder is now wrong, not just the
        // one on screen. cleanUpDeletedFolder drops all of them and prunes the
        // row out of the parent, so there is nothing left to re-read: the
        // listing the user is looking at is already correct.
        cleanUpDeletedFolder(normalizedKey);
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
      } finally {
        // Finished, failed or cancelled by the user all count as reported, so
        // the record goes. Two things are not reported: a run that never gets
        // here because the tab went away, and one the session ended underneath.
        // The second returns silently - no toast, no failed card - and still
        // leaves the folder with some of its contents gone, so it needs the
        // record just as much as the first.
        if (signal.reason !== SESSION_ENDED) {
          clearRecord(itemId);
        }
      }
    },
    [
      apiS3,
      refreshCurrentData,
      errorFunction,
      getAllS3ObjectsWithPrefix,
      startDeleteOperation,
      setCalculatingSize,
      updateDeleteProgress,
      updateSize,
      completeDeleteOperation,
      failDeleteOperation,
      recordStarted,
      clearRecord,
      cleanUpDeletedFolder,
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

      // Determine batch operation details
      const fileCount = items.filter(isFile).length;
      const folderCount = items.length - fileCount;
      const operationLabel =
        folderCount > 0 && fileCount > 0
          ? `Deleting ${fileCount} file${fileCount !== 1 ? 's' : ''} and ${folderCount} folder${folderCount !== 1 ? 's' : ''}`
          : folderCount > 0
            ? `Deleting ${folderCount} folder${folderCount !== 1 ? 's' : ''}`
            : `Deleting ${fileCount} file${fileCount !== 1 ? 's' : ''}`;

      // Deleting one thing is not a batch to the person doing it, so the card
      // says which thing. Only a real multi-selection falls back to a count.
      const single = items.length === 1 ? items[0] : undefined;
      const names = items.map(displayName);

      // Only meaningful when the whole selection is files: a folder has no
      // extension to agree with.
      const uniform = folderCount === 0 ? sharedExtension(names) : undefined;

      const signal = startDeleteOperation(itemId, {
        id: itemId,
        name: single ? displayName(single) : `${items.length} items`,
        // 'file' only where there is an extension to draw it from. A batch card
        // is named "8 items", which has no extension to read back off it, so
        // claiming 'file' without one lands on FileIcon's unknown-type
        // question mark - which reads as an error rather than as eight files.
        type: single
          ? isFolderLike(single)
            ? 'folder'
            : 'file'
          : fileCount === 0
            ? 'folder'
            : uniform
              ? 'file'
              : 'mixed',
        size: 0,
        status: 'deleting',
        progress: 0,
        operationLabel,
        extension: single
          ? isFolderLike(single)
            ? undefined
            : (single as FileItem).extension
          : uniform,
        detail: describeItems(names),
      });

      // Declared out here so the catch can reach them. `anyDispatched` is what
      // decides whether undoing is still honest: see undoOrResync.
      let undoRemoval: Revert = () => {};
      let anyDispatched = false;

      const undoOrResync = () => {
        // A revert only tells the truth while nothing has actually been
        // deleted. Once a batch has come back successfully, some of these keys
        // are gone and some are not, and putting every row back would be as
        // wrong as leaving them all out - so the bucket gets asked instead.
        //
        // "come back", not "gone out": the flag is set after the await, which
        // is what makes a first-batch failure revert rather than resync.
        if (anyDispatched) void refreshCurrentData({ silent: true });
        else undoRemoval();
      };

      try {
        // Show calculating state
        setCalculatingSize(itemId, true);
        updateDeleteProgress(itemId, 0);

        if (signal.aborted) {
          throw abortError();
        }

        // Collect all keys to delete (including folder contents)
        const allKeysToDelete: string[] = [];

        for (const item of items) {
          if (signal.aborted) {
            throw abortError();
          }

          if (isFile(item)) {
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

        if (signal.aborted) {
          throw abortError();
        }

        if (uniqueKeys.length === 0) {
          updateDeleteProgress(itemId, 100);
          completeDeleteOperation(itemId);
          // Nothing was deleted, so nothing in the listing has changed.
          return;
        }

        undoRemoval = removeFiles(uniqueKeys);

        // Batch delete in chunks of 1000 (S3 limit)
        const batchSize = 1000;
        let processed = 0;
        let deletedCount = 0;
        const failures: DeleteBatchError[] = [];

        for (let i = 0; i < uniqueKeys.length; i += batchSize) {
          if (signal.aborted) {
            throw abortError();
          }

          const batch = uniqueKeys.slice(i, i + batchSize);

          // Delete batch
          const result = normalizeDeleteResult(
            await apiS3.deleteBatch(batch.map((key) => ({ Key: key }))),
            batch.length
          );
          if (!result.reliable) warnLegacyProviderOnce();

          // Set after the call, not before it. Set beforehand, a failure on the
          // very first batch - offline, a 5xx, expired credentials - read as
          // "some of this was deleted", so undoOrResync resynced instead of
          // reverting. The resync is deliberately silent, so when it failed too
          // it changed nothing: the rows stayed gone, having never been deleted.
          anyDispatched = true;

          processed += batch.length;
          deletedCount += result.deleted;
          failures.push(...result.errors);

          // Progress from 5% to 95%
          const progress = 5 + (processed / uniqueKeys.length) * 90;
          updateDeleteProgress(itemId, progress, deletedCount, uniqueKeys.length);
        }

        if (signal.aborted) {
          throw abortError();
        }

        if (failures.length > 0) {
          const summary = describeFailures(failures, uniqueKeys.length);
          failDeleteOperation(itemId, summary);
          errorFunction(`Partially deleted selection: ${summary}`);
          await refreshCurrentData({ silent: true });
          throw new PartialDeleteError(summary, failures);
        }

        // Small delay to show final progress
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (signal.aborted) {
          throw abortError();
        }

        updateDeleteProgress(itemId, 100);
        completeDeleteOperation(itemId);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // A cancel can land between batches, so this is the same question as
          // a failure: how far did we get before stopping?
          undoOrResync();
          return;
        }
        if (error instanceof PartialDeleteError) {
          throw error;
        }
        undoOrResync();
        const errorMessage = error instanceof Error ? error.message : 'Batch delete failed';
        failDeleteOperation(itemId, errorMessage);
        errorFunction(`Failed to delete items: ${errorMessage}`);
        throw error;
      }
    },
    // batchDelete works from keys it already has, so it never lists a prefix
    [
      apiS3,
      removeFiles,
      refreshCurrentData,
      errorFunction,
      startDeleteOperation,
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

      // Only raw keys here, so the trailing slash is the only thing that says
      // folder. Same rule as isFolderLike, applied to a string.
      const markerCount = uniqueKeys.filter((key) => key.endsWith('/')).length;
      const onlyKey = uniqueKeys.length === 1 ? uniqueKeys[0]! : undefined;
      const names = uniqueKeys.map((key) => key.split('/').filter(Boolean).pop() ?? key);
      const uniform = markerCount === 0 ? sharedExtension(names) : undefined;

      const signal = startDeleteOperation(itemId, {
        id: itemId,
        name: onlyKey ? (names[0] ?? onlyKey) : `${uniqueKeys.length} items`,
        // Same rule as batchDelete: 'file' only where an icon can be drawn.
        type:
          markerCount === uniqueKeys.length
            ? 'folder'
            : markerCount > 0
              ? 'mixed'
              : onlyKey || uniform
                ? 'file'
                : 'mixed',
        size: 0,
        status: 'deleting',
        progress: 0,
        totalFiles: uniqueKeys.length,
        operationLabel: `Deleting ${uniqueKeys.length} item${uniqueKeys.length !== 1 ? 's' : ''}`,
        extension: onlyKey ? extensionOf(names[0] ?? '') : uniform,
        detail: describeItems(names),
      });

      // Same scaffolding as batchDelete, for the same reason.
      let undoRemoval: Revert = () => {};
      let anyDispatched = false;

      const undoOrResync = () => {
        if (anyDispatched) void refreshCurrentData({ silent: true });
        else undoRemoval();
      };

      try {
        updateDeleteProgress(itemId, 0, 0, uniqueKeys.length);

        if (signal.aborted) {
          throw abortError();
        }

        undoRemoval = removeFiles(uniqueKeys);

        // Batch delete in chunks of 1000 (S3 limit)
        const batchSize = 1000;
        let processed = 0;
        let deletedCount = 0;
        const failures: DeleteBatchError[] = [];

        for (let i = 0; i < uniqueKeys.length; i += batchSize) {
          if (signal.aborted) {
            throw abortError();
          }

          const batch = uniqueKeys.slice(i, i + batchSize);

          // Delete batch
          const result = normalizeDeleteResult(
            await apiS3.deleteBatch(batch.map((key) => ({ Key: key }))),
            batch.length
          );
          if (!result.reliable) warnLegacyProviderOnce();

          // Set after the call, not before it. Set beforehand, a failure on the
          // very first batch - offline, a 5xx, expired credentials - read as
          // "some of this was deleted", so undoOrResync resynced instead of
          // reverting. The resync is deliberately silent, so when it failed too
          // it changed nothing: the rows stayed gone, having never been deleted.
          anyDispatched = true;

          processed += batch.length;
          deletedCount += result.deleted;
          failures.push(...result.errors);

          const progress = (processed / uniqueKeys.length) * 100;
          updateDeleteProgress(itemId, progress, deletedCount, uniqueKeys.length);
        }

        if (signal.aborted) {
          throw abortError();
        }

        if (failures.length > 0) {
          const summary = describeFailures(failures, uniqueKeys.length);
          failDeleteOperation(itemId, summary);
          errorFunction(`Partially deleted items: ${summary}`);
          await refreshCurrentData({ silent: true });
          throw new PartialDeleteError(summary, failures);
        }

        completeDeleteOperation(itemId);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          undoOrResync();
          return;
        }
        if (error instanceof PartialDeleteError) {
          throw error;
        }
        undoOrResync();
        const errorMessage = error instanceof Error ? error.message : 'Batch delete failed';
        failDeleteOperation(itemId, errorMessage);
        errorFunction(`Failed to delete items: ${errorMessage}`);
        throw error;
      }
    },
    [
      apiS3,
      removeFiles,
      refreshCurrentData,
      errorFunction,
      startDeleteOperation,
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
