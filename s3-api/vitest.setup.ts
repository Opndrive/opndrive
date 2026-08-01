/**
 * Global test setup for the s3-api package.
 *
 * Registers the `aws-sdk-client-mock-vitest` matchers so any suite can assert
 * against a mocked S3 client without wiring matchers up per-file:
 *
 *   expect(s3Mock).toHaveReceivedCommandWith(ListObjectsV2Command, { Bucket: 'b' });
 *
 * The `/extend` import is type-only at runtime but is what teaches TypeScript
 * about the added matchers, so it must stay alongside `expect.extend`.
 */

import { expect } from 'vitest';
import { allCustomMatcher } from 'aws-sdk-client-mock-vitest';
import 'aws-sdk-client-mock-vitest/extend';

expect.extend(allCustomMatcher);
