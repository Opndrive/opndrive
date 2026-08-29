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
import { objectExists, objectKey } from '@/services/object-existence';
import { getParentPrefix } from '@/features/folder-navigation/folder-navigation';
import { generateUniqueFileName } from '../utils/unique-filename';

export interface DropOutcome {
  dispatched: DispatchResult[];
  notices: QueueNotice[];
  /** True when planning ran but nothing could be handed to the manager. */
  nothingStarted: boolean;
}

const EMPTY_OUTCOME: DropOutcome = { dispatched: [], notices: [], nothingStarted: true };

/** How many object-existence checks run at once, matching VERIFY_CONCURRENCY. */
const DUPLICATE_CHECK_CONCURRENCY = 5;

type FileVerdict =
  | { kind: 'upload'; file: File }
  | { kind: 'replace'; file: File }
  | { kind: 'skip' }
  // Told not to upload, which is a different thing from being unable to.
  | { kind: 'cancelled' }
  | { kind: 'unverified'; file: File; reason: string };

/** What the prompt came back with, and whether it stands for the rest. */
type DuplicateAnswer = {
  choice: 'replace' | 'keepBoth' | 'cancel';
  applyToAll: boolean;
};

/**
 * Decides what to do with each loose file before anything is dispatched.
 *
 * Folder collisions are planning's job; a loose file collides at the OBJECT
 * level, and S3 PUT overwrites silently, so this is the only thing standing
 * between a same-named drop and data loss. The prompt it drives is the one that
 * already existed - this pipeline simply bypassed it, which is the regression
 * being fixed.
 *
 * Checks run concurrently, unlike the sequential version this replaces.
 */
async function decideLooseFiles(
  files: readonly File[],
  destination: string,
  apiS3: BYOS3ApiProvider,
  ask: (file: File, remaining: number) => Promise<DuplicateAnswer>
): Promise<FileVerdict[]> {
  const verdicts: FileVerdict[] = new Array(files.length);
  const collisions: number[] = [];

  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(DUPLICATE_CHECK_CONCURRENCY, files.length) },
    async () => {
      while (cursor < files.length) {
        const index = cursor++;
        const file = files[index]!;
        try {
          const exists = await objectExists(apiS3, objectKey(destination, file.name));
          if (exists) collisions.push(index);
          else verdicts[index] = { kind: 'upload', file };
        } catch (error) {
          // Indeterminate. Uploading anyway may overwrite; refusing loses the
          // upload. Upload, but say so - the same call folder verification
          // makes, and the same notice channel.
          verdicts[index] = {
            kind: 'unverified',
            file,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      }
    }
  );
  await Promise.all(runners);

  /**
   * Prompts stay sequential: the dialog shows one question at a time, and
   * firing them all at once would stack five modals on the user.
   *
   * Which is why an answer the user asked to stand for the rest is honoured
   * here, by not asking again, rather than by answering a queue - the queue
   * never holds more than one, because the line below waits for each answer
   * before the next question exists. Ten files dropped onto ten that already
   * exist used to mean ten identical questions and ten clicks.
   */
  const ordered = collisions.sort((a, b) => a - b);
  let standing: DuplicateAnswer['choice'] | null = null;

  for (let position = 0; position < ordered.length; position++) {
    const index = ordered[position]!;
    const file = files[index]!;

    let choice = standing;
    if (!choice) {
      const answer = await ask(file, ordered.length - position);
      choice = answer.choice;
      if (answer.applyToAll) standing = answer.choice;
    }

    if (choice === 'cancel') {
      verdicts[index] = { kind: 'cancelled' };
      continue;
    }

    if (choice === 'replace') {
      verdicts[index] = { kind: 'replace', file };
      continue;
    }

    try {
      const uniqueName = await generateUniqueFileName(apiS3, file.name, destination);
      verdicts[index] = {
        kind: 'upload',
        file: new File([file], uniqueName, { type: file.type }),
      };
    } catch {
      // Could not find a free name, so there is no safe way to keep both.
      verdicts[index] = { kind: 'skip' };
    }
  }

  return verdicts;
}

export function useUploadDispatch() {
  const executor = useUploadExecutor();
  const addUpload = useUploadStore((state) => state.addUpload);
  const showDuplicateDialog = useUploadStore((state) => state.showDuplicateDialog);
  const hideDuplicateDialog = useUploadStore((state) => state.hideDuplicateDialog);

  /**
   * Shows the replace / keep-both prompt and resolves with the answer.
   *
   * Cancel resolves too. It used to close the dialog and nothing else, so the
   * promise below stayed pending forever and the whole drop stalled: every file
   * behind the cancelled one was never asked about and never uploaded.
   */
  const askAboutDuplicate = useCallback(
    (file: File, remaining: number) =>
      new Promise<DuplicateAnswer>((resolve) => {
        const answer = (choice: DuplicateAnswer['choice']) => (applyToAll: boolean) => {
          hideDuplicateDialog();
          resolve({ choice, applyToAll });
        };

        showDuplicateDialog(
          { name: file.name, type: 'file', size: file.size },
          answer('replace'),
          answer('keepBoth'),
          { onCancel: answer('cancel'), remaining }
        );
      }),
    [showDuplicateDialog, hideDuplicateDialog]
  );

  return useCallback(
    async (
      data: ProcessedDragData,
      destinationPrefix: string,
      apiS3?: BYOS3ApiProvider | null
    ): Promise<DropOutcome> => {
      // No session, no manager, nothing to dispatch into. Planning anyway would
      // reserve prefixes for uploads that can never run.
      if (!executor) return EMPTY_OUTCOME;

      // Object-level collisions for loose files, resolved BEFORE planning so
      // the plan carries the files the user actually agreed to upload.
      let individualFiles = data.individualFiles;
      const looseNotices: QueueNotice[] = [];

      if (apiS3 && individualFiles.length > 0) {
        const verdicts = await decideLooseFiles(
          individualFiles,
          destinationPrefix,
          apiS3,
          askAboutDuplicate
        );

        individualFiles = [];
        verdicts.forEach((verdict, index) => {
          if (verdict.kind === 'cancelled') {
            looseNotices.push({
              id: `dup-cancelled-${Date.now()}-${index}`,
              kind: 'skipped',
              path: data.individualFiles[index]!.name,
              count: 1,
              detail: `"${data.individualFiles[index]!.name}" already exists here and was not uploaded.`,
            });
            return;
          }

          if (verdict.kind === 'skip') {
            looseNotices.push({
              id: `dup-skip-${Date.now()}-${index}`,
              kind: 'skipped',
              path: data.individualFiles[index]!.name,
              count: 1,
              detail: `Could not find a free name for "${data.individualFiles[index]!.name}", so it was not uploaded.`,
            });
            return;
          }

          if (verdict.kind === 'unverified') {
            looseNotices.push({
              id: `dup-unverified-${Date.now()}-${index}`,
              kind: 'unverified',
              path: verdict.file.name,
              count: 1,
              detail: `Could not check whether "${verdict.file.name}" already exists here, so it is being uploaded under that name. If it does exist, it will be overwritten.`,
            });
          }

          individualFiles.push(verdict.file);
        });
      }

      const { planned, notices } = await useUploadQueueStore
        .getState()
        .planDrop({ ...data, individualFiles }, { destinationPrefix, apiS3 });

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
            // A folder plan's prefix already ends with the folder's resolved
            // name, so the listing that gains a row for it is the one above.
            destinationPrefix: getParentPrefix(result.plan.prefix),
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
              key: file.key,
              size: file.file.size,
              // Deliberately no destinationPrefix. These files are not added to
              // any listing one at a time - the folder card above adds a single
              // row for all of them once the last one lands.
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
              key: file.key,
              size: file.file.size,
              // Read back off the key that will actually be written rather than
              // taken from the plan, so the prefix is the one the finished row
              // will be looked up under whatever the key turned out to be.
              destinationPrefix: getParentPrefix(file.key),
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

      if (looseNotices.length > 0) {
        useUploadQueueStore.setState((state) => ({
          notices: [...state.notices, ...looseNotices],
        }));
      }

      return {
        dispatched,
        notices: [...notices, ...looseNotices],
        nothingStarted: dispatched.every((result) => result.files.length === 0),
      };
    },
    [executor, addUpload, askAboutDuplicate]
  );
}
