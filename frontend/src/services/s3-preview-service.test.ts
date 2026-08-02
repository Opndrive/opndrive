/**
 * S3 preview service: turns a file into a signed URL the viewer can load.
 *
 * The provider is injected and faked. What this layer owns is picking the key
 * off an object that may spell it three different ways, asking for an inline
 * disposition, and rewrapping failures with context.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BYOS3ApiProvider } from '@opndrive/s3-api';
import { createS3PreviewService } from './s3-preview-service';
import type { PreviewableFile } from '@/types/file-preview';

function fakeApi(getSignedUrl = vi.fn(async () => 'https://signed.example/preview')) {
  return { getSignedUrl } as unknown as BYOS3ApiProvider & { getSignedUrl: typeof getSignedUrl };
}

const asFile = (partial: Record<string, unknown>) => partial as unknown as PreviewableFile;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('resolving the object key', () => {
  it('prefers the S3-style Key', async () => {
    const api = fakeApi();

    await createS3PreviewService(api).getSignedUrl(
      asFile({ Key: 'docs/report.pdf', key: 'ignored', name: 'ignored.pdf' })
    );

    expect(api.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'docs/report.pdf' })
    );
  });

  it('falls back to a lowercase key', async () => {
    const api = fakeApi();

    await createS3PreviewService(api).getSignedUrl(
      asFile({ key: 'docs/report.pdf', name: 'report.pdf' })
    );

    expect(api.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'docs/report.pdf' })
    );
  });

  it('falls back to the name when neither key is present', async () => {
    const api = fakeApi();

    await createS3PreviewService(api).getSignedUrl(asFile({ name: 'report.pdf' }));

    expect(api.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({ key: 'report.pdf' }));
  });

  it('rejects a file with nothing to address it by', async () => {
    const api = fakeApi();

    await expect(createS3PreviewService(api).getSignedUrl(asFile({}))).rejects.toThrow(
      /No file key found/
    );

    expect(api.getSignedUrl).not.toHaveBeenCalled();
  });
});

describe('the signing request', () => {
  it('asks for an inline preview URL valid for an hour', async () => {
    const api = fakeApi();

    await createS3PreviewService(api).getSignedUrl(asFile({ Key: 'docs/report.pdf' }));

    // isPreview drives Content-Disposition: inline, which is what makes the
    // browser render the file instead of downloading it.
    expect(api.getSignedUrl).toHaveBeenCalledWith({
      key: 'docs/report.pdf',
      expiryInSeconds: 3600,
      isPreview: true,
      responseContentType: 'application/pdf',
    });
  });

  it('derives the content type from the key, not the display name', async () => {
    const api = fakeApi();

    await createS3PreviewService(api).getSignedUrl(
      asFile({ Key: 'photos/holiday.png', name: 'whatever.pdf' })
    );

    expect(api.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ responseContentType: 'image/png' })
    );
  });

  it('falls back to a binary content type for an unknown extension', async () => {
    const api = fakeApi();

    await createS3PreviewService(api).getSignedUrl(asFile({ Key: 'thing.qqq' }));

    expect(api.getSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ responseContentType: 'application/octet-stream' })
    );
  });

  it('returns the signed URL unchanged', async () => {
    const api = fakeApi(vi.fn(async () => 'https://signed.example/abc?sig=1'));

    await expect(createS3PreviewService(api).getSignedUrl(asFile({ Key: 'a.pdf' }))).resolves.toBe(
      'https://signed.example/abc?sig=1'
    );
  });
});

describe('failures', () => {
  it('rejects when signing produces nothing', async () => {
    const api = fakeApi(vi.fn(async () => ''));

    // An empty URL would put the viewer into a permanent loading state.
    await expect(
      createS3PreviewService(api).getSignedUrl(asFile({ Key: 'a.pdf' }))
    ).rejects.toThrow(/Failed to generate signed URL/);
  });

  it('wraps a provider error with its message', async () => {
    const api = fakeApi(
      vi.fn(async () => {
        throw new Error('Key starting with /');
      })
    );

    await expect(
      createS3PreviewService(api).getSignedUrl(asFile({ Key: '/a.pdf' }))
    ).rejects.toThrow('Failed to generate signed URL: Key starting with /');
  });

  it('describes a non-Error rejection', async () => {
    const api = fakeApi(
      vi.fn(async () => {
        throw 'just a string';
      })
    );

    await expect(
      createS3PreviewService(api).getSignedUrl(asFile({ Key: 'a.pdf' }))
    ).rejects.toThrow('Failed to generate signed URL for file preview');
  });

  it('logs the underlying failure for debugging', async () => {
    const api = fakeApi(
      vi.fn(async () => {
        throw new Error('AccessDenied');
      })
    );

    await expect(
      createS3PreviewService(api).getSignedUrl(asFile({ Key: 'a.pdf' }))
    ).rejects.toThrow();

    expect(console.error).toHaveBeenCalled();
  });

  it('gives each provider its own service', () => {
    expect(createS3PreviewService(fakeApi())).not.toBe(createS3PreviewService(fakeApi()));
  });
});
