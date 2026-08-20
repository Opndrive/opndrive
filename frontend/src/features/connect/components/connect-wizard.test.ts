/**
 * The credential building that used to live inline in the old connect page.
 *
 * It moved during the rewrite, so these pin the behaviour that was already
 * there: how a typed folder path becomes an S3 prefix, and when the endpoint
 * is derived rather than taken from the form.
 */

import { describe, expect, it } from 'vitest';
import { buildCredentials, formatPrefix } from './connect-wizard';
import { getProviderBySlug } from '@/config/providers';

const aws = getProviderBySlug('aws-s3')!;
const wasabi = getProviderBySlug('wasabi')!;
const minio = getProviderBySlug('minio')!;

const baseForm = {
  accessKeyId: 'AKIA123',
  secretAccessKey: 'shh',
  bucketName: 'my-bucket',
  region: 'us-east-1',
  prefix: '',
  endpoint: '',
};

describe('formatPrefix', () => {
  it('is empty for empty input', () => {
    expect(formatPrefix('')).toBe('');
    expect(formatPrefix('   ')).toBe('');
  });

  it('turns a single folder into a prefix', () => {
    expect(formatPrefix('projects')).toBe('projects/');
  });

  it('joins words typed with spaces', () => {
    expect(formatPrefix('projects documents')).toBe('projects/documents/');
  });

  it('accepts commas as separators too', () => {
    expect(formatPrefix('projects, documents')).toBe('projects/documents/');
  });

  it('strips slashes the user typed themselves', () => {
    expect(formatPrefix('projects/documents')).toBe('projectsdocuments/');
  });
});

describe('buildCredentials', () => {
  it('passes the basics straight through', () => {
    const credentials = buildCredentials(aws, baseForm);

    expect(credentials.accessKeyId).toBe('AKIA123');
    expect(credentials.bucketName).toBe('my-bucket');
    expect(credentials.region).toBe('us-east-1');
  });

  // AWS derives its endpoint from the SDK, so sending an empty one would be
  // worse than sending none.
  it('omits the endpoint entirely when there is nothing to send', () => {
    expect('endpoint' in buildCredentials(aws, baseForm)).toBe(false);
  });

  it('derives the endpoint from the region when the provider has a template', () => {
    const credentials = buildCredentials(wasabi, { ...baseForm, region: 'eu-west-1' });

    expect(credentials.endpoint).toBe('https://s3.eu-west-1.wasabisys.com');
  });

  it('prefers an endpoint the user typed over the derived one', () => {
    const credentials = buildCredentials(wasabi, {
      ...baseForm,
      endpoint: 'https://custom.example.com',
    });

    expect(credentials.endpoint).toBe('https://custom.example.com');
  });

  it('trims a pasted endpoint', () => {
    const credentials = buildCredentials(minio, {
      ...baseForm,
      endpoint: '  https://minio.internal:9000  ',
    });

    expect(credentials.endpoint).toBe('https://minio.internal:9000');
  });

  it('formats the prefix on the way through', () => {
    const credentials = buildCredentials(aws, { ...baseForm, prefix: 'team reports' });

    expect(credentials.prefix).toBe('team/reports/');
  });
});
