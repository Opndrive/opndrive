import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { S3_PROVIDERS, getProviderBySlug } from '@/config/providers';
import { CONNECTION_FAILURE_TITLES } from '@/lib/s3/connection-failure';
import { CONNECTION_ERRORS_GUIDE, ConnectionTroubleshooting } from './connection-troubleshooting';
import { DOCS_URL } from '@/config/links';

describe('ConnectionTroubleshooting', () => {
  it.each(S3_PROVIDERS.map((p) => [p.name, p] as const))(
    'quotes, for %s, every message the app shows on a failed connection',
    (_name, provider) => {
      render(<ConnectionTroubleshooting provider={provider} />);
      const section = screen.getByRole('region', { name: 'If it fails' });

      // The words on screen, not a paraphrase of them: read from the same
      // constant the classifier uses.
      for (const kind of ['network', 'credentials', 'bucket', 'permissions'] as const) {
        expect(
          within(section).getByRole('heading', { name: `“${CONNECTION_FAILURE_TITLES[kind]}”` })
        ).toBeTruthy();
      }
      expect(within(section).getByText(/Large uploads never finish/)).toBeTruthy();
    }
  );

  it('names the error codes the classifier maps to each message', () => {
    const html = renderToStaticMarkup(
      <ConnectionTroubleshooting provider={getProviderBySlug('aws-s3')!} />
    );

    for (const code of [
      'InvalidAccessKeyId',
      'SignatureDoesNotMatch',
      'NoSuchBucket',
      'PermanentRedirect',
      'AccessDenied',
    ]) {
      expect(html).toContain(code);
    }
  });

  it('adds what is particular to the provider', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('aws-s3')!} />);
    expect(screen.getByText(/AuthorizationHeaderMalformed/)).toBeTruthy();
  });

  it('leaves the provider box out when there is nothing particular to say', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('wasabi')!} />);
    expect(screen.queryByText(/Particular to/)).toBeNull();
  });

  it('links to the full guide in the docs', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('minio')!} />);
    const link = screen.getByRole('link', { name: /Every connection error, explained/ });
    expect(link.getAttribute('href')).toBe(CONNECTION_ERRORS_GUIDE);
    expect(CONNECTION_ERRORS_GUIDE).toBe(`${DOCS_URL}/guides/fixing-connection-errors`);
  });

  it('is in the server-rendered markup, where a crawler reads it', () => {
    const html = renderToStaticMarkup(
      <ConnectionTroubleshooting provider={getProviderBySlug('cloudflare-r2')!} />
    );
    expect(html).toContain('id="if-it-fails"');
    expect(html).toContain(CONNECTION_FAILURE_TITLES.network);
  });
});
