/**
 * The credential building that used to live inline in the old connect page.
 *
 * It moved during the rewrite, so these pin the behaviour that was already
 * there: how a typed folder path becomes an S3 prefix, and when the endpoint
 * is derived rather than taken from the form.
 */

import { describe, expect, it } from 'vitest';
import { buildCredentials, formatPrefix } from './connect-wizard';
import { getProviderBySlug, resolveEndpoint, S3_PROVIDERS } from '@/config/providers';

const aws = getProviderBySlug('aws-s3')!;
const wasabi = getProviderBySlug('wasabi')!;
const minio = getProviderBySlug('minio')!;
const r2 = getProviderBySlug('cloudflare-r2')!;
const custom = getProviderBySlug('custom-endpoint')!;

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

  // R2's endpoint is keyed by an account id the form never asks for, so there
  // is nothing to derive. Sending the unfilled template would be a broken URL.
  it('sends no endpoint for a provider whose template it cannot fill', () => {
    expect('endpoint' in buildCredentials(r2, baseForm)).toBe(false);
  });
});

// The catch-all exists because /connect used to send "using something else?"
// to /connect/minio, so anyone on DigitalOcean or Scaleway landed on a page
// about self-hosting MinIO. It has no template of its own by design: whatever
// the user pastes is the endpoint, and there is nothing to derive it from.
describe('the custom endpoint provider', () => {
  it('has nothing to derive an endpoint from', () => {
    expect(custom.endpoint).toBe('');
    expect(resolveEndpoint(custom, 'us-east-1')).toBe('');
  });

  it('sends what the user pasted, and nothing when they paste nothing', () => {
    const pasted = buildCredentials(custom, {
      ...baseForm,
      endpoint: 'https://nyc3.digitaloceanspaces.com',
    });

    expect(pasted.endpoint).toBe('https://nyc3.digitaloceanspaces.com');
    expect('endpoint' in buildCredentials(custom, baseForm)).toBe(false);
  });

  // Without this the form would let someone submit with no endpoint at all,
  // which is the one field the provider cannot supply for them.
  it('marks the endpoint as required', () => {
    expect(custom.requiresCustomEndpoint).toBe(true);
  });
});

describe('resolveEndpoint', () => {
  it('fills the region in', () => {
    expect(resolveEndpoint(wasabi, 'eu-west-1')).toBe('https://s3.eu-west-1.wasabisys.com');
  });

  // The bug this guards: R2 came back as the literal template, and the wizard
  // offered it to the user as "Defaults to
  // https://{{accountId}}.r2.cloudflarestorage.com" on a field it had just
  // made required.
  it('is empty when a placeholder is left it cannot fill', () => {
    expect(resolveEndpoint(r2, 'auto')).toBe('');
  });

  it('is empty for a provider with no template at all', () => {
    expect(resolveEndpoint(minio, 'us-east-1')).toBe('');
  });
});

/**
 * What the endpoint field offers when it is empty.
 *
 * `endpoint` is a template, and using it directly as the placeholder is how R2
 * came to present a literal `{{accountId}}` as the thing to type. Wasabi and
 * Backblaze had the same hole with `{{region}}`; they are filled in by
 * `resolveEndpoint` and shown in the hint under the field instead.
 *
 * The other half of that bug: three providers declare `endpoint: ''`, so a
 * chain that reached for the template with `??` rather than `||` resolved to
 * the empty string and left a required field with no example at all.
 */
describe('the endpoint placeholder', () => {
  const placeholderFor = (provider: (typeof S3_PROVIDERS)[number]) =>
    provider.endpointPlaceholder ?? 'https://storage.example.com';

  it.each(S3_PROVIDERS.map((p) => [p.slug, p] as const))(
    'gives %s something to look at that is not a template',
    (_slug, provider) => {
      const placeholder = placeholderFor(provider);

      expect(placeholder).not.toBe('');
      expect(placeholder).not.toContain('{{');
    }
  );

  it('spells R2 out, because its account id is never derivable', () => {
    expect(placeholderFor(r2)).toBe('https://<account-id>.r2.cloudflarestorage.com');
  });

  it('leaves region-only providers to the derived hint', () => {
    expect(wasabi.endpointPlaceholder).toBeUndefined();
    expect(resolveEndpoint(wasabi, 'eu-west-1')).toBe('https://s3.eu-west-1.wasabisys.com');
  });
});
