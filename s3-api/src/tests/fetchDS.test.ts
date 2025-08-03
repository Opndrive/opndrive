import { BYOS3ApiProvider } from '@/byo-s3';
import { Credentials } from '@/core';
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

describe('BYOS3ApiProvider', () => {
  it('fetches a paginated directory structure with expected keys', async () => {
    const myCreds: Credentials = {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      bucketName: BUCKET_NAME,
      prefix: '',
      region: AWS_REGION,
    };

    const api = new BYOS3ApiProvider(myCreds);
    const result = await api.fetchDirectoryStructure(myCreds.prefix, 2);

    expect(result).toMatchObject({
      files: expect.any(Array),
      folders: expect.any(Array),
    });

    expect(result).toHaveProperty('nextToken');
    expect(result).toHaveProperty('isTruncated');
  });
});
