/**
 * Guards the store-reset harness itself (`__mocks__/zustand.ts`).
 *
 * Every other store suite trusts that state does not survive a test. If that
 * ever breaks, the symptom is a distant, order-dependent failure somewhere
 * else, so it is worth catching here instead.
 *
 * Each pair below is deliberately ordered: the first test dirties the store,
 * the second asserts it came back clean.
 */

import { describe, it, expect } from 'vitest';
import { useDownloadStore } from '@/features/dashboard/stores/use-download-store';
import { useUploadStore } from '@/features/upload/stores/use-upload-store';

const download = () => useDownloadStore.getState();
const upload = () => useUploadStore.getState();

describe('state written through actions', () => {
  it('dirties both stores', () => {
    download().setProgress({
      fileId: 'f',
      fileName: 'f',
      progress: 1,
      status: 'downloading',
    });
    upload().addUpload('u', {
      id: 'u',
      name: 'u',
      status: 'queued',
      progress: 0,
      type: 'file',
    });

    expect(download().downloads.size).toBe(1);
    expect(Object.keys(upload().uploads)).toHaveLength(1);
  });

  it('finds both stores clean again', () => {
    expect(download().downloads.size).toBe(0);
    expect(upload().uploads).toEqual({});
  });
});

describe('state mutated in place, bypassing actions', () => {
  it('mutates the nested containers directly', () => {
    // Not how the app writes state, but a test can do it - and if the harness
    // restored the captured object by reference, this would poison the initial
    // state for every test that follows, permanently.
    download().downloads.set('sneaky', { fileId: 'sneaky' } as never);
    upload().uploads.sneaky = { id: 'sneaky' } as never;

    expect(download().downloads.size).toBe(1);
    expect(Object.keys(upload().uploads)).toHaveLength(1);
  });

  it('still finds both stores clean', () => {
    expect(download().downloads.size).toBe(0);
    expect(upload().uploads).toEqual({});
  });
});

describe('keys a test adds to the state', () => {
  it('adds a key that is not part of the store shape', () => {
    useDownloadStore.setState({ somethingExtra: true } as never);

    expect((download() as unknown as Record<string, unknown>).somethingExtra).toBe(true);
  });

  it('drops the extra key on reset', () => {
    // Requires `replace: true`; a merging set would leave it behind.
    expect((download() as unknown as Record<string, unknown>).somethingExtra).toBeUndefined();
  });
});
