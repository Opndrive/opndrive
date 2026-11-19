/**
 * The Auto upload mode: each file goes the way that suits its size, and
 * everything after that reaches the manager that took it.
 */

import { describe, expect, it, vi } from 'vitest';
import type { SignedUrlUploadManager, UploadManager } from '@opndrive/s3-api';
import {
  AUTO_MULTIPART_THRESHOLD,
  AutoUploadManager,
  canPauseUpload,
  managerForMode,
} from './auto-upload-manager';

/** A manager double that remembers the ids it handed out, as the real ones do. */
function fakeManager(prefix: string) {
  const known = new Map<string, { status: 'queued'; progress: number }>();
  let next = 0;

  return {
    known,
    addUpload: vi.fn(() => {
      const id = `${prefix}-${next++}`;
      known.set(id, { status: 'queued', progress: 0 });
      return id;
    }),
    getStatus: vi.fn((id: string) => known.get(id)),
    getAllStatuses: vi.fn(() => Object.fromEntries(known)),
    retryUpload: vi.fn(() => true),
    discardUpload: vi.fn(() => true),
    cancelUpload: vi.fn(async () => {}),
    pauseUpload: vi.fn(),
    resumeUpload: vi.fn(async () => {}),
    on: vi.fn(),
    off: vi.fn(),
  };
}

function setup() {
  const multipart = fakeManager('mp');
  const signed = fakeManager('su');
  const auto = new AutoUploadManager(
    multipart as unknown as UploadManager,
    signed as unknown as SignedUrlUploadManager
  );
  return { multipart, signed, auto };
}

function fileOf(size: number): File {
  const file = new File(['x'], 'f.bin');
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('AutoUploadManager', () => {
  it('sends a file under 100 MB as one signed upload', () => {
    const { multipart, signed, auto } = setup();

    auto.addUpload(fileOf(AUTO_MULTIPART_THRESHOLD - 1), { key: 'small.bin' });

    expect(signed.addUpload).toHaveBeenCalledOnce();
    expect(multipart.addUpload).not.toHaveBeenCalled();
  });

  it('sends a file of 100 MB and up as multipart', () => {
    const { multipart, signed, auto } = setup();

    auto.addUpload(fileOf(AUTO_MULTIPART_THRESHOLD), { key: 'big.bin' });
    auto.addUpload(fileOf(6 * 1024 * 1024 * 1024), { key: 'huge.bin' });

    expect(multipart.addUpload).toHaveBeenCalledTimes(2);
    expect(signed.addUpload).not.toHaveBeenCalled();
  });

  it('sends cancel, retry and discard to the manager that took the upload', async () => {
    const { multipart, signed, auto } = setup();
    const small = auto.addUpload(fileOf(10), { key: 'a' });
    const big = auto.addUpload(fileOf(AUTO_MULTIPART_THRESHOLD), { key: 'b' });

    await auto.cancelUpload(small);
    auto.retryUpload(big);
    auto.discardUpload(small);

    expect(signed.cancelUpload).toHaveBeenCalledWith(small);
    expect(multipart.cancelUpload).not.toHaveBeenCalled();
    expect(multipart.retryUpload).toHaveBeenCalledWith(big);
    expect(signed.discardUpload).toHaveBeenCalledWith(small);
  });

  it('pauses and resumes only what went multipart', async () => {
    const { multipart, signed, auto } = setup();
    const small = auto.addUpload(fileOf(10), { key: 'a' });
    const big = auto.addUpload(fileOf(AUTO_MULTIPART_THRESHOLD), { key: 'b' });

    auto.pauseUpload(small);
    auto.pauseUpload(big);
    await auto.resumeUpload(big);

    expect(signed.pauseUpload).not.toHaveBeenCalled();
    expect(multipart.pauseUpload).toHaveBeenCalledWith(big);
    expect(multipart.resumeUpload).toHaveBeenCalledWith(big);
  });

  it('answers for an id neither manager knows without throwing', async () => {
    const { auto } = setup();

    expect(auto.getStatus('nope')).toBeUndefined();
    expect(auto.retryUpload('nope')).toBe(false);
    await expect(auto.cancelUpload('nope')).resolves.toBeUndefined();
  });

  it('listens to both managers, and stops listening to both', () => {
    const { multipart, signed, auto } = setup();
    const listener = vi.fn();

    auto.on('statusChange', listener);
    auto.off('statusChange', listener);

    expect(multipart.on).toHaveBeenCalledWith('statusChange', listener);
    expect(signed.on).toHaveBeenCalledWith('statusChange', listener);
    expect(multipart.off).toHaveBeenCalledWith('statusChange', listener);
    expect(signed.off).toHaveBeenCalledWith('statusChange', listener);
  });

  it('is stateless: another instance over the same pair routes the same ids', async () => {
    const { multipart, signed, auto } = setup();
    const big = auto.addUpload(fileOf(AUTO_MULTIPART_THRESHOLD), { key: 'b' });

    const other = new AutoUploadManager(
      multipart as unknown as UploadManager,
      signed as unknown as SignedUrlUploadManager
    );
    await other.cancelUpload(big);

    expect(multipart.cancelUpload).toHaveBeenCalledWith(big);
  });
});

describe('managerForMode', () => {
  const multipart = fakeManager('mp') as unknown as UploadManager;
  const signed = fakeManager('su') as unknown as SignedUrlUploadManager;

  it('hands back the one manager for a fixed mode', () => {
    expect(managerForMode('multipart', multipart, signed)).toBe(multipart);
    expect(managerForMode('signed-url', multipart, signed)).toBe(signed);
  });

  it('gives Auto the same object every time for the same pair', () => {
    // The upload context rebuilds its executor whenever this identity changes.
    const first = managerForMode('auto', multipart, signed);

    expect(first).toBeInstanceOf(AutoUploadManager);
    expect(managerForMode('auto', multipart, signed)).toBe(first);
  });

  it('has nothing for Auto without both managers', () => {
    expect(managerForMode('auto', null, signed)).toBeNull();
    expect(managerForMode('auto', multipart, null)).toBeNull();
  });
});

describe('canPauseUpload', () => {
  it('pauses every multipart upload, and no signed one', () => {
    const { auto } = setup();

    expect(canPauseUpload('multipart', auto, 'x')).toBe(true);
    expect(canPauseUpload('signed-url', auto, 'x')).toBe(false);
  });

  it('decides per file under Auto', () => {
    const { auto } = setup();
    const small = auto.addUpload(fileOf(10), { key: 'a' });
    const big = auto.addUpload(fileOf(AUTO_MULTIPART_THRESHOLD), { key: 'b' });

    expect(canPauseUpload('auto', auto, big)).toBe(true);
    expect(canPauseUpload('auto', auto, small)).toBe(false);
  });
});
