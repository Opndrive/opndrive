import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { S3_PROVIDERS, getProviderBySlug } from '@/config/providers';
import {
  CONNECTION_FAILURE_CODES,
  CONNECTION_FAILURE_TITLES,
  classifyConnectionFailure,
} from '@/lib/s3/connection-failure';
import { CONNECTION_ERRORS_GUIDE, ConnectionTroubleshooting } from './connection-troubleshooting';
import { DOCS_URL } from '@/config/links';

const section = () => screen.getByRole('region', { name: 'If it fails' });

describe('ConnectionTroubleshooting', () => {
  it.each(S3_PROVIDERS.map((p) => [p.name, p] as const))(
    'quotes, for %s, every message the app shows on a failed connection',
    (_name, provider) => {
      render(<ConnectionTroubleshooting provider={provider} />);

      // The words on screen, not a paraphrase of them: read from the same
      // constant the classifier uses - all five, the unrecognised one too.
      for (const title of Object.values(CONNECTION_FAILURE_TITLES)) {
        expect(within(section()).getByRole('heading', { name: `“${title}”` })).toBeTruthy();
      }
    }
  );

  it('describes the missing-ETag symptom without quoting it as a message the app shows', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('aws-s3')!} />);

    const heading = within(section()).getByRole('heading', { name: /^Large uploads fail/ });
    expect(heading.textContent).not.toMatch(/[“”]/);
  });

  it.each(['credentials', 'bucket', 'permissions'] as const)(
    'lists every code the classifier files under %s, and its status',
    (kind) => {
      const html = renderToStaticMarkup(
        <ConnectionTroubleshooting provider={getProviderBySlug('aws-s3')!} />
      );
      const { names, status } = CONNECTION_FAILURE_CODES[kind];

      for (const name of names) {
        expect(html).toContain(`<code>${name}</code>`);
        // And the classifier really does put that code under this heading.
        expect(classifyConnectionFailure({ name, $metadata: {} }).kind).toBe(kind);
      }
      expect(html).toContain(`any other ${status} answer`);
      expect(
        classifyConnectionFailure({ name: 'Unlisted', $metadata: { httpStatusCode: status } }).kind
      ).toBe(kind);
    }
  );

  it('sends a blocked request to step 1 where CORS has to be set', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('aws-s3')!} />);
    expect(
      within(section()).getByText(/does not allow this site yet: follow step 1 above/)
    ).toBeTruthy();
  });

  it.each(['minio', 'wasabi'])(
    'says CORS has been restricted where it is open by default (%s)',
    (slug) => {
      render(<ConnectionTroubleshooting provider={getProviderBySlug(slug)!} />);
      expect(
        within(section()).getByText(/has been restricted and does not include this site/)
      ).toBeTruthy();
    }
  );

  it('does not tell MinIO users to expose ETag, which MinIO already does', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('minio')!} />);
    const text = section().textContent ?? '';

    expect(text).toContain('MinIO exposes ETag in its own CORS answers');
    expect(text).not.toContain('as it is in the policy above');
  });

  it('tells everyone else to expose ETag, as the policy above does', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('cloudflare-r2')!} />);
    expect(section().textContent).toContain('as it is in the policy above');
  });

  it('adds what is particular to the provider', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('aws-s3')!} />);
    const box = screen.getByText(/Particular to Amazon S3/).parentElement!;
    expect(within(box).getByText(/AuthorizationHeaderMalformed/)).toBeTruthy();
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
