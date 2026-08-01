import { BYOS3ApiProvider } from '../index.js';
import type { Credentials, SignedUrlParams } from '../core/types.js';
import { describe, it, expect } from 'vitest';

/**
 * Presigning is computed locally (HMAC over the request), so these need no
 * network and no real bucket - unlike the credential-gated suites in
 * byoS3.test.ts. Fake credentials produce a real, inspectable URL.
 */
const fakeCreds: Credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucketName: 'test-bucket',
  prefix: '',
  region: 'us-east-1',
};

function dispositionOf(url: string): string | null {
  return new URL(url).searchParams.get('response-content-disposition');
}

const baseParams: SignedUrlParams = {
  key: 'folder/abc123hash',
  expiryInSeconds: 900,
  isPreview: false,
};

describe('getSignedUrl content disposition', () => {
  it('forces an attachment filename for downloads', async () => {
    const api = new BYOS3ApiProvider(fakeCreds, 'BYO');

    const url = await api.getSignedUrl({ ...baseParams, downloadFilename: 'quarterly report.pdf' });

    // Without this the browser names the file after the key ("abc123hash"),
    // because <a download> is ignored cross-origin.
    expect(dispositionOf(url)).toBe(
      `attachment; filename="quarterly report.pdf"; filename*=UTF-8''quarterly%20report.pdf`
    );
  });

  it('omits the header when no filename is requested', async () => {
    const api = new BYOS3ApiProvider(fakeCreds, 'BYO');

    const url = await api.getSignedUrl(baseParams);

    expect(dispositionOf(url)).toBeNull();
  });

  it('keeps preview URLs inline', async () => {
    const api = new BYOS3ApiProvider(fakeCreds, 'BYO');

    const url = await api.getSignedUrl({
      ...baseParams,
      isPreview: true,
      downloadFilename: 'ignored.pdf',
    });

    expect(dispositionOf(url)).toBe('inline');
  });

  it('encodes non-ascii names and still supplies an ascii fallback', async () => {
    const api = new BYOS3ApiProvider(fakeCreds, 'BYO');

    const url = await api.getSignedUrl({ ...baseParams, downloadFilename: '文档.pdf' });
    const disposition = dispositionOf(url);

    // The quoted-string form cannot carry non-ascii, so it degrades to a
    // neutral stem - keeping the extension - while filename* carries the truth.
    expect(disposition).toBe(
      `attachment; filename="download.pdf"; filename*=UTF-8''%E6%96%87%E6%A1%A3.pdf`
    );
  });

  it('transliterates accents in the ascii fallback rather than dropping them', async () => {
    const api = new BYOS3ApiProvider(fakeCreds, 'BYO');

    const url = await api.getSignedUrl({ ...baseParams, downloadFilename: 'café résumé.pdf' });

    // "caf rsum.pdf" would be a confusing name to land on disk.
    expect(dispositionOf(url)).toBe(
      `attachment; filename="cafe resume.pdf"; filename*=UTF-8''caf%C3%A9%20r%C3%A9sum%C3%A9.pdf`
    );
  });

  it('emits a header S3 can carry for emoji names', async () => {
    const api = new BYOS3ApiProvider(fakeCreds, 'BYO');

    const url = await api.getSignedUrl({ ...baseParams, downloadFilename: '📄 report.xlsx' });
    const disposition = dispositionOf(url)!;

    // Header values must be ascii; the emoji only survives percent-encoded.
    expect(disposition).toMatch(/^[\x20-\x7e]*$/);
    expect(disposition).toContain(`filename*=UTF-8''%F0%9F%93%84%20report.xlsx`);
    expect(disposition).toContain('filename="report.xlsx"');
  });

  it('strips quotes and control characters that would break out of the header', async () => {
    const api = new BYOS3ApiProvider(fakeCreds, 'BYO');

    const url = await api.getSignedUrl({
      ...baseParams,
      downloadFilename: 'ev"il\r\nX-Injected: 1.txt',
    });
    const disposition = dispositionOf(url)!;

    // CR/LF are what make header injection possible; the remaining text is
    // inert inside a balanced quoted-string.
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition).not.toContain('ev"il');
    // Exactly one quoted-string, so nothing escaped the filename parameter.
    expect(disposition.match(/"/g)).toHaveLength(2);
  });

  it('drops any directory component from the suggested name', async () => {
    const api = new BYOS3ApiProvider(fakeCreds, 'BYO');

    const url = await api.getSignedUrl({
      ...baseParams,
      downloadFilename: 'nested/path/report.pdf',
    });

    expect(dispositionOf(url)).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`
    );
  });
});
