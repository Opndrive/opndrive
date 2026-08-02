'use client';

/**
 * The one entry point from "the user dropped something" to "bytes are moving".
 *
 *   ProcessedDragData
 *         |
 *         v
 *   planDrop()            destinations, collisions, notices
 *         |  PlannedUpload[]
 *         v
 *   executor.start()      keys, task ids, claim lifecycle
 *         |  DispatchResult[]
 *         v
 *   use-upload-store      the cards the operations panel renders
 *
 * It replaces `useUploadStore.handleFilesDroppedToDirectory`, which checked
 * collisions against the bucket only (so two folders named "photos" in one drop
 * both passed and the second overwrote the first), returned on the first
 * duplicate (abandoning every folder behind it), and built its keys through
 * `addFolderUpload` (which re-nests a renamed folder under its original name).
 */

import { useCallback } from 'react';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import type { ProcessedDragData } from '../types/folder-upload-types';
import { useUploadQueueStore, type QueueNotice } from '../stores/use-upload-queue-store';
import { useUploadStore } from '../stores/use-upload-store';
import { useUploadExecutor } from '../context/upload-context';
import type { DispatchResult } from '../services/upload-executor';

export interface DropOutcome {
  dispatched: DispatchResult[];
  notices: QueueNotice[];
  /** True when planning ran but nothing could be handed to the manager. */
  nothingStarted: boolean;
}

const EMPTY_OUTCOME: DropOutcome = { dispatched: [], notices: [], nothingStarted: true };

export function useUploadDispatch() {
  const executor = useUploadExecutor();
  const addUpload = useUploadStore((state) => state.addUpload);

  return useCallback(
    async (
      data: ProcessedDragData,
      destinationPrefix: string,
      apiS3?: BYOS3ApiProvider | null
    ): Promise<DropOutcome> => {
      // No session, no manager, nothing to dispatch into. Planning anyway would
      // reserve prefixes for uploads that can never run.
      if (!executor) return EMPTY_OUTCOME;

      const { planned, notices } = await useUploadQueueStore
        .getState()
        .planDrop(data, { destinationPrefix, apiS3 });

      const dispatched = executor.start(planned);

      for (const result of dispatched) {
        if (result.plan.kind === 'folder') {
          // The folder card owns the task id, which is what `cancelTask` takes,
          // so cancelling from the UI needs no extra bookkeeping.
          addUpload(result.taskId, {
            id: result.taskId,
            name: result.plan.resolvedName,
            status: 'queued',
            progress: 0,
            type: 'folder',
            fileIds: result.files.map((file) => file.uploadId),
          });

          for (const file of result.files) {
            addUpload(file.uploadId, {
              id: file.uploadId,
              // The key rather than the bare name, so two files called
              // "img.jpg" from different subfolders stay distinguishable.
              name: file.key,
              status: 'queued',
              progress: 0,
              type: 'file',
              parentFolderId: result.taskId,
            });
          }
        } else {
          // Loose files get no wrapper card; each is its own row.
          for (const file of result.files) {
            addUpload(file.uploadId, {
              id: file.uploadId,
              name: file.file.name,
              status: 'queued',
              progress: 0,
              type: 'file',
            });
          }
        }

        // The manager refused this plan outright - a disposed manager after a
        // logout or bucket switch. Say so on a card rather than dropping it.
        if (result.dispatchError && result.files.length === 0) {
          addUpload(result.taskId, {
            id: result.taskId,
            name: result.plan.resolvedName || 'Upload',
            status: 'failed',
            progress: 0,
            type: result.plan.kind,
            error: result.dispatchError.message,
          });
        }
      }

      return {
        dispatched,
        notices,
        nothingStarted: dispatched.every((result) => result.files.length === 0),
      };
    },
    [executor, addUpload]
  );
}
