'use client';

import type {
  EventListener,
  SignedUrlUploadManager,
  UploadEvent,
  UploadManager,
  UploadStatus,
} from '@opndrive/s3-api';
import type { UploadMode } from '../types';

/**
 * Where Auto switches from one request to multipart: 100 MB, the size from
 * which AWS recommends multipart. Below it a single signed PUT is fewer
 * requests and faster; from it up, a dropped connection costs one part rather
 * than the whole file, and the upload can be paused. A single PUT also cannot
 * exceed 5 GB, which multipart can.
 */
export const AUTO_MULTIPART_THRESHOLD = 100 * 1024 * 1024;

/**
 * The Auto upload mode: picks the method for each file by its size, and sends
 * everything after that - cancel, retry, pause - to whichever manager took it.
 *
 * Shaped like the two managers it stands for, so the executor, the upload
 * events and the operations panel treat it as one and never need to know.
 * Holds no state of its own: the manager an upload belongs to is the one that
 * knows its id, and both keep every id they were given. So any instance for
 * the same pair answers the same, and nothing here has to be kept in sync.
 * Ids are UUIDs, so the two managers cannot both know one.
 */
export class AutoUploadManager {
  constructor(
    readonly multipart: UploadManager,
    readonly signedUrl: SignedUrlUploadManager,
    private readonly threshold = AUTO_MULTIPART_THRESHOLD
  ) {}

  /** The manager this upload went to, or undefined if neither knows it. */
  private ownerOf(id: string): UploadManager | SignedUrlUploadManager | undefined {
    if (this.multipart.getStatus(id)) return this.multipart;
    if (this.signedUrl.getStatus(id)) return this.signedUrl;
    return undefined;
  }

  /** Whether this upload went multipart, which is what can be paused. */
  isMultipart(id: string): boolean {
    return this.multipart.getStatus(id) !== undefined;
  }

  addUpload(file: File, config: { key: string; contentType?: string }): string {
    const manager = file.size >= this.threshold ? this.multipart : this.signedUrl;
    return manager.addUpload(file, config);
  }

  retryUpload(id: string): boolean {
    return this.ownerOf(id)?.retryUpload(id) ?? false;
  }

  discardUpload(id: string): boolean {
    return this.ownerOf(id)?.discardUpload(id) ?? false;
  }

  async cancelUpload(id: string): Promise<void> {
    await this.ownerOf(id)?.cancelUpload(id);
  }

  pauseUpload(id: string): void {
    // A signed PUT cannot be paused; the panel offers no button for one, and
    // this keeps a stray call from reaching a manager that would cancel it.
    if (this.isMultipart(id)) this.multipart.pauseUpload(id);
  }

  async resumeUpload(id: string): Promise<void> {
    if (this.isMultipart(id)) await this.multipart.resumeUpload(id);
  }

  getStatus(id: string): { status: UploadStatus; progress: number } | undefined {
    return this.ownerOf(id)?.getStatus(id);
  }

  getAllStatuses(): Record<string, { status: UploadStatus; progress: number }> {
    return { ...this.multipart.getAllStatuses(), ...this.signedUrl.getAllStatuses() };
  }

  on(event: UploadEvent, listener: EventListener): void {
    this.multipart.on(event, listener);
    this.signedUrl.on(event, listener);
  }

  off(event: UploadEvent, listener: EventListener): void {
    this.multipart.off(event, listener);
    this.signedUrl.off(event, listener);
  }
}

export type ActiveUploadManager = UploadManager | SignedUrlUploadManager | AutoUploadManager;

/**
 * One Auto manager per pair of managers, so its identity is stable: the
 * upload context rebuilds its executor whenever the manager it is handed
 * changes, and a fresh object every render would rebuild it every render.
 * Weakly held, so a session's pair goes with the session.
 */
const autoManagers = new WeakMap<
  UploadManager,
  WeakMap<SignedUrlUploadManager, AutoUploadManager>
>();

/** The manager uploads go through in this mode, or null without a session. */
export function managerForMode(
  mode: UploadMode,
  multipart: UploadManager | null,
  signedUrl: SignedUrlUploadManager | null
): ActiveUploadManager | null {
  if (mode === 'signed-url') return signedUrl;
  if (mode === 'multipart') return multipart;
  if (!multipart || !signedUrl) return null;

  let bySigned = autoManagers.get(multipart);
  if (!bySigned) {
    bySigned = new WeakMap();
    autoManagers.set(multipart, bySigned);
  }

  let auto = bySigned.get(signedUrl);
  if (!auto) {
    auto = new AutoUploadManager(multipart, signedUrl);
    bySigned.set(signedUrl, auto);
  }

  return auto;
}

/**
 * Whether the panel can offer Pause on this upload. Multipart uploads can be
 * paused and a single signed PUT cannot; under Auto that is decided per file.
 */
export function canPauseUpload(
  mode: UploadMode,
  manager: ActiveUploadManager | null,
  id: string
): boolean {
  if (mode === 'multipart') return true;
  if (mode === 'auto') return manager instanceof AutoUploadManager && manager.isMultipart(id);
  return false;
}
