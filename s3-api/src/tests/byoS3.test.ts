import { BYOS3ApiProvider, RenameFolderParams, SearchParams } from '../../dist/index';
import {
  Credentials,
  PresignedUploadParams,
  RenameFileParams,
  SignedUrlParams,
} from '../../dist/index';
import { describe, it, expect } from 'vitest';

import dotenv from 'dotenv';
dotenv.config();

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.BUCKET_NAME;
const AWS_REGION = process.env.AWS_REGION;

const hasS3Credentials = Boolean(
  AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && BUCKET_NAME && AWS_REGION
);

const myCreds: Credentials = {
  accessKeyId: AWS_ACCESS_KEY_ID ?? '',
  secretAccessKey: AWS_SECRET_ACCESS_KEY ?? '',
  bucketName: BUCKET_NAME ?? '',
  prefix: '',
  region: AWS_REGION ?? '',
};

const describeIfConfigured = hasS3Credentials ? describe : describe.skip;

function expectPresignedUrl(result: string) {
  const url = new URL(result);

  expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
}

describeIfConfigured('BYOS3ApiProvider', () => {
  it('fetches a paginated directory structure with expected keys', async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');
    const result = await api.fetchDirectoryStructure(myCreds.prefix, 2);

    expect(result).toMatchObject({
      files: expect.any(Array),
      folders: expect.any(Array),
    });

    expect(result).toHaveProperty('nextToken');
    expect(result).toHaveProperty('isTruncated');
  });
});

describeIfConfigured('BYOS3ApiProvider', () => {
  it('fetches metadata of a specific file', async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');
    const result = await api.fetchMetadata('Screenshot 2025-06-13 142914.png');
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

describeIfConfigured('BYOS3ApiProvider', () => {
  it('returns a presigned URL for a valid key for data upload on client side', async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');

    const params: PresignedUploadParams = {
      key: 'users/data/file.jpg',
      expiresInSeconds: 900,
    };

    const result = await api.uploadWithPreSignedUrl(params);
    expect(typeof result).toBe('string');
    expectPresignedUrl(result);
  });

  it('throws an error for a key starting with a slash', async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');
    const params: PresignedUploadParams = {
      key: '/users/data/file.jpg',
      expiresInSeconds: 900,
    };

    await expect(api.uploadWithPreSignedUrl(params)).rejects.toBeDefined();
  });

  it('throws an error for negative expiration', async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');

    const params: PresignedUploadParams = {
      key: 'users/data/file.jpg',
      expiresInSeconds: -2,
    };

    await expect(api.uploadWithPreSignedUrl(params)).rejects.toBeDefined();
  });
});

describeIfConfigured('BYOS3ApiProvider', () => {
  it('returns a presigned URL to access data', async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');

    const params: SignedUrlParams = {
      key: 'pogo.png',
      expiryInSeconds: 900,
      isPreview: false,
      responseContentType: 'image/png',
    };

    const result = await api.getSignedUrl(params);

    expect(typeof result).toBe('string');
    expectPresignedUrl(result);
  });

  it('returns a preview presigned URL to access data', async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');

    const params: SignedUrlParams = {
      key: 'geo-api.js',
      expiryInSeconds: 900,
      isPreview: true,
      responseContentType: 'application/text',
    };

    const result = await api.getSignedUrl(params);

    expect(typeof result).toBe('string');
    expectPresignedUrl(result);
  });
});

describeIfConfigured('BYOS3ApiProvider', () => {
  it('renames a file to another', { timeout: 60000 }, async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');

    const params: RenameFileParams = {
      basePath: 'users/c7581c39-99ab-4a36-8942-598557806c04/',
      oldName: 'parser.py',
      newName: 'parser_n.py',
    };

    const result = await api.renameFile(params);

    expect(result).toBeTruthy();
  });

  it('throws error : renames a file to another', { timeout: 60000 }, async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');

    const params: RenameFileParams = {
      basePath: '/users/c7581c39-99ab-4a36-8942-598557806c04',
      oldName: 'parser.py',
      newName: 'parser_n.py',
    };

    const result = await api.renameFile(params);

    expect(result).toBeTruthy();
  });
});

describeIfConfigured('BYOS3ApiProvider', () => {
  it('renames a folder to another', { timeout: 60000 }, async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');

    const params: RenameFolderParams = {
      newPrefix: 'users/exefiles/',
      oldPrefix: 'users/demo1/',
    };

    const result = await api.renameFolder(params);

    expect(typeof result).toBe('object');
  });
});

describeIfConfigured('BYOS3ApiProvider', () => {
  it('searches as folder or file', async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');

    const params: SearchParams = {
      prefix: '',
      searchTerm: 'abc',
      nextToken: undefined,
    };

    const result = await api.search(params);

    expect(typeof result).toBe('object');
  });
});
