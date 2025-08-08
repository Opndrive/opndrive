/**
 * This file is only for local testing the BYOS3ApiProvider api class using environment variables. In production these variables will come through the user input and will be stored in a local storage. This file is not meant to be used in production environment.
 */

import { BYOS3ApiProvider } from '@opndrive/s3-api';

const AWS_ACCESS_KEY_ID = process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!;
const AWS_SECRET_ACCESS_KEY = process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!;
const BUCKET_NAME = process.env.NEXT_PUBLIC_BUCKET_NAME!;
const AWS_REGION = process.env.NEXT_PUBLIC_AWS_REGION!;

if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !BUCKET_NAME || !AWS_REGION) {
  throw new Error('Missing environment variables');
}

const myCreds = {
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  bucketName: BUCKET_NAME,
  prefix: '',
  region: AWS_REGION,
};

export const apiS3 = new BYOS3ApiProvider(myCreds, 'BYO');
