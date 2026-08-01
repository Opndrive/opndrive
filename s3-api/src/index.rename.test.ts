/**
 * Copy-and-delete operations: `moveFile`, `renameFile`, and `renameFolder`.
 *
 * These are the only methods in the package that delete data the user did not
 * explicitly ask to delete, so the ordering guarantees matter more than the
 * happy path. The recurring assertion below is "on failure, nothing was
 * deleted" - `renameFolder` copies everything, verifies it arrived, and only
 * then removes the originals.
 *
 * There is deliberately NO rollback: a failed copy leaves orphaned objects at
 * the destination rather than trying to undo them. Re-running the same rename
 * overwrites them, because CopyObject is idempotent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { BYOS3ApiProvider } from './index.js';
import type { Credentials, RenameFolderProgress } from './core/types.js';

const s3Mock = mockClient(S3Client);

const creds: Credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucketName: 'test-bucket',
  prefix: '',
  region: 'us-east-1',
};

function makeApi() {
  return new BYOS3ApiProvider(creds, 'BYO');
}

function s3Error(name: string, httpStatusCode = 403) {
  return new S3ServiceException({
    name,
    $fault: 'client',
    $metadata: { httpStatusCode },
    message: name,
  });
}

/** Stubs the listing for a prefix, returning the given keys as one page. */
function stubListing(prefix: string, keys: string[]) {
  s3Mock
    .on(ListObjectsV2Command, { Prefix: prefix })
    .resolves({ Contents: keys.map((Key) => ({ Key })) });
}

const copiedKeys = () =>
  s3Mock.commandCalls(CopyObjectCommand).map((c) => c.args[0].input.Key as string);

const deletedKeys = () =>
  s3Mock
    .commandCalls(DeleteObjectsCommand)
    .flatMap((c) => (c.args[0].input.Delete?.Objects ?? []).map((o) => o.Key as string));

beforeEach(() => {
  s3Mock.reset();
});

describe('moveFile', () => {
  it('copies to the new key and only then deletes the old one', async () => {
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});

    await makeApi().moveFile({ oldKey: 'a/old.txt', newKey: 'b/new.txt' });

    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(CopyObjectCommand, {
      Bucket: 'test-bucket',
      CopySource: 'test-bucket/a%2Fold.txt',
      Key: 'b/new.txt',
    });
    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(DeleteObjectCommand, {
      Bucket: 'test-bucket',
      Key: 'a/old.txt',
    });
  });

  it('url-encodes the copy source so keys with spaces and symbols survive', async () => {
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});

    await makeApi().moveFile({ oldKey: 'a/my file & notes.txt', newKey: 'b/n.txt' });

    // An unencoded CopySource makes S3 read everything after the first '&' as
    // a query parameter and the copy silently targets the wrong object.
    expect(s3Mock).toHaveReceivedCommandWith(CopyObjectCommand, {
      CopySource: 'test-bucket/a%2Fmy%20file%20%26%20notes.txt',
    });
  });

  it('does not delete the source when the copy fails', async () => {
    s3Mock.on(CopyObjectCommand).rejects(s3Error('AccessDenied'));

    await expect(makeApi().moveFile({ oldKey: 'a/old.txt', newKey: 'b/new.txt' })).rejects.toThrow(
      /Move failed for a\/old.txt → b\/new.txt/
    );

    // The whole point of copy-then-delete: a failed move must be a no-op, not
    // a data-loss event.
    expect(s3Mock).not.toHaveReceivedCommand(DeleteObjectCommand);
  });

  it('wraps a failed delete, leaving a duplicate rather than losing the file', async () => {
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).rejects(s3Error('AccessDenied'));

    await expect(makeApi().moveFile({ oldKey: 'a/old.txt', newKey: 'b/new.txt' })).rejects.toThrow(
      /Move failed/
    );
  });
});

describe('renameFile', () => {
  beforeEach(() => {
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});
  });

  it('renames within the base path and reports success', async () => {
    const result = await makeApi().renameFile({
      basePath: 'users/alice/',
      oldName: 'draft.md',
      newName: 'final.md',
    });

    expect(result).toBe(true);
    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(CopyObjectCommand, {
      CopySource: 'test-bucket/users%2Falice%2Fdraft.md',
      Key: 'users/alice/final.md',
    });
    expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(DeleteObjectCommand, {
      Key: 'users/alice/draft.md',
    });
  });

  it('appends the missing trailing slash to the base path', async () => {
    await makeApi().renameFile({
      basePath: 'users/alice',
      oldName: 'draft.md',
      newName: 'final.md',
    });

    // Without this the rename would target 'users/alicedraft.md'.
    expect(s3Mock).toHaveReceivedCommandWith(CopyObjectCommand, {
      Key: 'users/alice/final.md',
    });
  });

  it('rejects a base path with a leading slash', async () => {
    await expect(
      makeApi().renameFile({ basePath: '/users/alice/', oldName: 'a.md', newName: 'b.md' })
    ).rejects.toThrow(/Rename failed for a.md → b.md.*Key starting with \//s);

    expect(s3Mock).not.toHaveReceivedCommand(CopyObjectCommand);
  });

  it('does not delete the original when the copy fails', async () => {
    s3Mock.on(CopyObjectCommand).rejects(s3Error('AccessDenied'));

    await expect(
      makeApi().renameFile({ basePath: 'users/alice/', oldName: 'a.md', newName: 'b.md' })
    ).rejects.toThrow(/Rename failed/);

    expect(s3Mock).not.toHaveReceivedCommand(DeleteObjectCommand);
  });
});

describe('renameFolder: guard rails', () => {
  it('refuses to rename a prefix onto itself', async () => {
    await expect(
      makeApi().renameFolder({ oldPrefix: 'docs/', newPrefix: 'docs/' })
    ).rejects.toThrow('source and destination prefixes are identical');

    expect(s3Mock).not.toHaveReceivedAnyCommand();
  });

  it('treats a missing trailing slash as the same prefix', async () => {
    // Normalisation happens before the equality check, so 'docs' and 'docs/'
    // must not slip through as "different".
    await expect(makeApi().renameFolder({ oldPrefix: 'docs', newPrefix: 'docs/' })).rejects.toThrow(
      'identical'
    );
  });

  it('refuses to rename a folder into its own descendant', async () => {
    await expect(
      makeApi().renameFolder({ oldPrefix: 'docs/', newPrefix: 'docs/archive/' })
    ).rejects.toThrow(/overlapping prefixes/);

    // The copy phase would write into the key range being listed, and the
    // delete phase would then remove the freshly-copied objects.
    expect(s3Mock).not.toHaveReceivedAnyCommand();
  });

  it('refuses to rename a folder onto its own ancestor', async () => {
    await expect(
      makeApi().renameFolder({ oldPrefix: 'docs/archive/', newPrefix: 'docs/' })
    ).rejects.toThrow(/overlapping prefixes/);
  });

  it('allows unrelated sibling prefixes that share a name stem', async () => {
    // 'docs2/' starts with neither 'docs/' nor vice versa once both are
    // slash-terminated, so it must NOT be caught by the overlap guard.
    stubListing('docs/', []);
    stubListing('docs2/', []);

    const result = await makeApi().renameFolder({ oldPrefix: 'docs', newPrefix: 'docs2' });

    expect(result.status).toBe('completed');
  });
});

describe('renameFolder: copy phase', () => {
  it('copies every key under the prefix to the new one', async () => {
    stubListing('old/', ['old/a.txt', 'old/nested/b.txt']);
    stubListing('new/', ['new/a.txt', 'new/nested/b.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    expect(copiedKeys().sort()).toEqual(['new/a.txt', 'new/nested/b.txt']);
    expect(result).toMatchObject({
      status: 'completed',
      totalKeys: 2,
      copiedKeys: 2,
      deletedKeys: 2,
      completed: true,
      errors: [],
    });
  });

  it('follows pagination when listing the source prefix', async () => {
    s3Mock
      .on(ListObjectsV2Command, { Prefix: 'old/' })
      .resolvesOnce({ Contents: [{ Key: 'old/a.txt' }], NextContinuationToken: 'p2' })
      .resolvesOnce({ Contents: [{ Key: 'old/b.txt' }] });
    stubListing('new/', ['new/a.txt', 'new/b.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    // Missing page 2 would silently leave half the folder behind.
    expect(result.totalKeys).toBe(2);
    expect(copiedKeys().sort()).toEqual(['new/a.txt', 'new/b.txt']);
  });

  it('replaces only the leading prefix, not every occurrence in the key', async () => {
    stubListing('a/', ['a/x/a/deep.txt']);
    stubListing('b/', ['b/x/a/deep.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});

    await makeApi().renameFolder({ oldPrefix: 'a/', newPrefix: 'b/' });

    // String.replace with a string pattern swaps the FIRST match only, which
    // is what makes a repeated prefix inside the key safe.
    expect(copiedKeys()).toEqual(['b/x/a/deep.txt']);
  });

  it('emits copy progress during the copy, not in one burst afterwards', async () => {
    stubListing('old/', ['old/a.txt', 'old/b.txt']);
    stubListing('new/', ['new/a.txt', 'new/b.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});
    const events: RenameFolderProgress[] = [];

    await makeApi().renameFolder({
      oldPrefix: 'old/',
      newPrefix: 'new/',
      onProgress: (p) => events.push({ ...p }),
    });

    const copying = events.filter((e) => e.phase === 'copying');
    expect(copying.map((e) => e.processed)).toEqual([1, 2]);
    // Both keys are reported, each paired with its destination. Sorted because
    // the copy phase is concurrent, so completion order is not part of the
    // contract - but the values are.
    expect(copying.map((e) => e.currentKey).sort()).toEqual(['old/a.txt', 'old/b.txt']);
    expect(copying.map((e) => e.newKey).sort()).toEqual(['new/a.txt', 'new/b.txt']);
    expect(copying.every((e) => e.total === 2)).toBe(true);
  });

  it('runs through all three phases in order', async () => {
    stubListing('old/', ['old/a.txt']);
    stubListing('new/', ['new/a.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});
    const phases: string[] = [];

    await makeApi().renameFolder({
      oldPrefix: 'old/',
      newPrefix: 'new/',
      onProgress: (p) => phases.push(p.phase),
    });

    expect(phases).toEqual(['copying', 'verifying', 'deleting']);
  });

  it('bounds copy concurrency to 8 in-flight requests', async () => {
    const keys = Array.from({ length: 30 }, (_, i) => `old/${i}.txt`);
    stubListing('old/', keys);
    stubListing(
      'new/',
      keys.map((k) => k.replace('old/', 'new/'))
    );
    s3Mock.on(DeleteObjectsCommand).resolves({});

    let inFlight = 0;
    let peak = 0;
    s3Mock.on(CopyObjectCommand).callsFake(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return {};
    });

    await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    // Unbounded parallelism on a 100k-object folder would open 100k sockets and
    // trip S3's rate limiter.
    expect(peak).toBe(8);
    expect(copiedKeys()).toHaveLength(30);
  });
});

describe('renameFolder: copy failure leaves the source intact', () => {
  it('deletes nothing and reports failure when a copy fails', async () => {
    stubListing('old/', ['old/a.txt', 'old/b.txt', 'old/c.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(CopyObjectCommand, { Key: 'new/b.txt' }).rejects(s3Error('AccessDenied'));

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    expect(result).toMatchObject({
      status: 'failed',
      totalKeys: 3,
      copiedKeys: 2,
      deletedKeys: 0,
      completed: false,
    });
    // The source prefix is still the only complete copy of this data.
    expect(s3Mock).not.toHaveReceivedCommand(DeleteObjectsCommand);
  });

  it('keeps copying after a failure instead of stopping at the first one', async () => {
    stubListing('old/', ['old/a.txt', 'old/b.txt', 'old/c.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(CopyObjectCommand, { Key: 'new/a.txt' }).rejects(s3Error('AccessDenied'));

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    // One inaccessible object shouldn't hide what else is wrong; nothing is
    // deleted regardless, so there is no risk in continuing.
    expect(copiedKeys().sort()).toEqual(['new/a.txt', 'new/b.txt', 'new/c.txt']);
    expect(result.copiedKeys).toBe(2);
  });

  it('records the failing key and its error code', async () => {
    stubListing('old/', ['old/a.txt']);
    s3Mock.on(CopyObjectCommand).rejects(s3Error('AccessDenied'));

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    expect(result.errors).toEqual([
      { key: 'old/a.txt', code: 'AccessDenied', message: 'AccessDenied' },
    ]);
  });

  it('records a non-service error without a code', async () => {
    stubListing('old/', ['old/a.txt']);
    s3Mock.on(CopyObjectCommand).rejects(new Error('socket hang up'));

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    expect(result.errors).toEqual([
      { key: 'old/a.txt', code: undefined, message: 'socket hang up' },
    ]);
  });

  it('caps the reported errors at 10 to keep the payload bounded', async () => {
    const keys = Array.from({ length: 25 }, (_, i) => `old/${i}.txt`);
    stubListing('old/', keys);
    s3Mock.on(CopyObjectCommand).rejects(s3Error('AccessDenied'));

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    // totalKeys still reports the true scale; only the enumeration is capped.
    expect(result.errors).toHaveLength(10);
    expect(result.totalKeys).toBe(25);
    expect(result.copiedKeys).toBe(0);
  });
});

describe('renameFolder: verification', () => {
  it('compares the exact key set, not just a count', async () => {
    stubListing('old/', ['old/a.txt', 'old/b.txt']);
    // Destination has the right NUMBER of objects but the wrong ones: 'b.txt'
    // never arrived and an unrelated pre-existing file makes up the count.
    stubListing('new/', ['new/a.txt', 'new/unrelated-preexisting.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    // A count-based check passes here and then deletes the originals - the
    // exact data-loss bug this comparison exists to prevent, and the reason
    // the "Replace" flow made it reachable in practice.
    expect(result.status).toBe('failed');
    expect(result.errors[0]!.key).toBe('new/b.txt');
    expect(result.errors[0]!.message).toMatch(/not present at the destination/);
    expect(s3Mock).not.toHaveReceivedCommand(DeleteObjectsCommand);
  });

  it('succeeds when the destination also holds unrelated pre-existing files', async () => {
    stubListing('old/', ['old/a.txt']);
    stubListing('new/', ['new/a.txt', 'new/something-else.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    // Extra objects at the destination are fine - only the absence of an
    // expected one is fatal.
    expect(result.status).toBe('completed');
  });

  it('reports every missing key, capped at 10', async () => {
    const keys = Array.from({ length: 15 }, (_, i) => `old/${i}.txt`);
    stubListing('old/', keys);
    stubListing('new/', []); // nothing arrived
    s3Mock.on(CopyObjectCommand).resolves({});

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    expect(result.status).toBe('failed');
    expect(result.errors).toHaveLength(10);
    expect(result.copiedKeys).toBe(15);
    expect(result.deletedKeys).toBe(0);
  });

  it('emits a verifying progress event before deleting anything', async () => {
    stubListing('old/', ['old/a.txt']);
    stubListing('new/', ['new/a.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});
    const events: RenameFolderProgress[] = [];

    await makeApi().renameFolder({
      oldPrefix: 'old/',
      newPrefix: 'new/',
      onProgress: (p) => events.push({ ...p }),
    });

    expect(events.find((e) => e.phase === 'verifying')).toMatchObject({
      total: 1,
      processed: 0,
    });
  });
});

describe('renameFolder: delete phase', () => {
  it('deletes the old keys only after verification passes', async () => {
    stubListing('old/', ['old/a.txt', 'old/b.txt']);
    stubListing('new/', ['new/a.txt', 'new/b.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    expect(deletedKeys().sort()).toEqual(['old/a.txt', 'old/b.txt']);
    expect(result.deletedKeys).toBe(2);
  });

  it('batches deletions at the 1000-object API limit', async () => {
    const keys = Array.from({ length: 2500 }, (_, i) => `old/${i}.txt`);
    stubListing('old/', keys);
    stubListing(
      'new/',
      keys.map((k) => k.replace('old/', 'new/'))
    );
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    // DeleteObjects rejects a request carrying more than 1000 keys outright.
    const batches = s3Mock.commandCalls(DeleteObjectsCommand);
    expect(batches).toHaveLength(3);
    expect(batches.map((b) => b.args[0].input.Delete!.Objects!.length)).toEqual([1000, 1000, 500]);
    expect(result.deletedKeys).toBe(2500);
  });

  it('reports a partial cleanup failure as a SUCCESSFUL rename', async () => {
    stubListing('old/', ['old/a.txt', 'old/b.txt']);
    stubListing('new/', ['new/a.txt', 'new/b.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({
      Errors: [{ Key: 'old/b.txt', Code: 'AccessDenied', Message: 'Access Denied' }],
    });

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    // The data is complete and correct at the new name; a leftover original is
    // a cleanup problem. Calling this "failed" would tell the user their
    // rename did not happen, which is actively false.
    expect(result).toMatchObject({
      status: 'copied-not-cleaned',
      completed: false,
      copiedKeys: 2,
      deletedKeys: 1,
    });
    expect(result.errors).toEqual([
      { key: 'old/b.txt', code: 'AccessDenied', message: 'Access Denied' },
    ]);
  });

  it('emits deleting progress with a running total', async () => {
    const keys = Array.from({ length: 1500 }, (_, i) => `old/${i}.txt`);
    stubListing('old/', keys);
    stubListing(
      'new/',
      keys.map((k) => k.replace('old/', 'new/'))
    );
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});
    const events: RenameFolderProgress[] = [];

    await makeApi().renameFolder({
      oldPrefix: 'old/',
      newPrefix: 'new/',
      onProgress: (p) => events.push({ ...p }),
    });

    expect(events.filter((e) => e.phase === 'deleting').map((e) => e.processed)).toEqual([
      1000, 1500,
    ]);
  });
});

describe('renameFolder: edge cases', () => {
  it('completes trivially for an empty folder', async () => {
    stubListing('old/', []);
    stubListing('new/', []);

    const result = await makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' });

    expect(result).toEqual({
      status: 'completed',
      totalKeys: 0,
      copiedKeys: 0,
      deletedKeys: 0,
      errors: [],
      completed: true,
    });
    expect(s3Mock).not.toHaveReceivedCommand(CopyObjectCommand);
    expect(s3Mock).not.toHaveReceivedCommand(DeleteObjectsCommand);
  });

  it('normalises prefixes that arrive without a trailing slash', async () => {
    stubListing('old/', ['old/a.txt']);
    stubListing('new/', ['new/a.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});

    const result = await makeApi().renameFolder({ oldPrefix: 'old', newPrefix: 'new' });

    // Listing 'old' rather than 'old/' would also match a sibling file named
    // 'oldest.txt' and drag it into the rename.
    expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, { Prefix: 'old/' });
    expect(result.status).toBe('completed');
  });

  it('works without a progress callback', async () => {
    stubListing('old/', ['old/a.txt']);
    stubListing('new/', ['new/a.txt']);
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectsCommand).resolves({});

    await expect(
      makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' })
    ).resolves.toMatchObject({ status: 'completed' });
  });

  it('propagates a failure to list the source prefix', async () => {
    s3Mock.on(ListObjectsV2Command).rejects(s3Error('AccessDenied'));

    // Treating an unreadable prefix as an empty one would report a successful
    // rename of nothing.
    await expect(
      makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' })
    ).rejects.toThrow();
    expect(s3Mock).not.toHaveReceivedCommand(CopyObjectCommand);
  });

  it('propagates a failure to list the destination during verification', async () => {
    stubListing('old/', ['old/a.txt']);
    s3Mock.on(ListObjectsV2Command, { Prefix: 'new/' }).rejects(s3Error('AccessDenied'));
    s3Mock.on(CopyObjectCommand).resolves({});

    await expect(
      makeApi().renameFolder({ oldPrefix: 'old/', newPrefix: 'new/' })
    ).rejects.toThrow();

    // Unverifiable means undeletable.
    expect(s3Mock).not.toHaveReceivedCommand(DeleteObjectsCommand);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
