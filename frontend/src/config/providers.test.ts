/**
 * The registry's contract with everything that reads it.
 *
 * Adding a provider touches several files, and the ones that go wrong fail
 * silently: getCorsConfig returns an empty string that the setup guide then
 * hides, and a duplicate slug quietly shadows an existing page. Neither throws,
 * so without these the first sign of a half-added provider is a page missing
 * the content that justifies its existence.
 *
 * The matching check for the logo tile lives in provider-mark.test.tsx, which
 * needs to render to see the failure.
 */

import { describe, expect, it } from 'vitest';
import { S3_PROVIDERS, PROVIDER_SLUGS, getProviderBySlug } from './providers';
import { getCorsConfig } from './cors';

describe('every provider', () => {
  it.each(S3_PROVIDERS.map((provider) => [provider.slug, provider] as const))(
    '%s ships a CORS policy for the setup guide',
    (_slug, provider) => {
      expect(getCorsConfig(provider.id).trim()).not.toBe('');
    }
  );

  it.each(S3_PROVIDERS.map((provider) => [provider.slug, provider] as const))(
    '%s carries its own copy rather than a template',
    (_slug, provider) => {
      // The header comment on the registry is explicit that near-identical
      // pages are what gets a site penalised. This is that rule, enforced.
      expect(provider.seo.intro.length).toBeGreaterThan(80);
      expect(provider.setup.corsInstructions.length).toBeGreaterThan(40);
      expect(provider.setup.permissions.length).toBeGreaterThan(0);
    }
  );

  it('has a slug nothing else uses', () => {
    expect(new Set(PROVIDER_SLUGS).size).toBe(PROVIDER_SLUGS.length);
  });

  it('has an intro no other provider shares', () => {
    const intros = S3_PROVIDERS.map((provider) => provider.seo.intro);

    expect(new Set(intros).size).toBe(intros.length);
  });

  it('has a title no other provider shares', () => {
    const titles = S3_PROVIDERS.map((provider) => provider.seo.title);

    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe('the catch-all', () => {
  // /connect links "set it up as a custom endpoint" here. That link used to go
  // to /connect/minio, so the slug existing is the fix.
  it('is reachable at the slug the hub links to', () => {
    expect(getProviderBySlug('custom-endpoint')).toBeDefined();
  });

  it('is last, so the picker reads as "or anything else"', () => {
    expect(S3_PROVIDERS[S3_PROVIDERS.length - 1]?.slug).toBe('custom-endpoint');
  });
});

describe('getProviderBySlug', () => {
  it('is undefined for a slug we do not have, so the route can 404', () => {
    expect(getProviderBySlug('dropbox')).toBeUndefined();
  });
});
