import { BYOS3ApiProvider } from '@/byo-s3';
import { Credentials, PresignedUploadParams } from '@/core/types';
import { describe, it, expect } from 'vitest';

import dotenv from 'dotenv';
dotenv.config();

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.BUCKET_NAME;
const AWS_REGION = process.env.AWS_REGION;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !BUCKET_NAME || !AWS_REGION) {
  throw new Error('Missing environment variables');
}

const myCreds: Credentials = {
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  bucketName: BUCKET_NAME,
  prefix: '',
  region: AWS_REGION,
};

describe('BYOS3ApiProvider', () => {
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

describe('BYOS3ApiProvider', () => {
  it('fetches metadata of a specific file', async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');
    const result = await api.fetchMetadata('Screenshot 2025-06-13 142914.png');
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

describe('BYOS3ApiProvider', () => {
  it('returns a presigned URL for a valid key', async () => {
    const api = new BYOS3ApiProvider(myCreds, 'BYO');

    const params: PresignedUploadParams = {
      key: 'users/data/file.jpg',
      expiresInSeconds: 900,
    };

    const result = await api.uploadWithPreSignedUrl(params);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
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
