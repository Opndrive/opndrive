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
      expect(html).toContain(`any other error answered with HTTP status ${status}`);
      expect(
        classifyConnectionFailure({ name: 'Unlisted', $metadata: { httpStatusCode: status } }).kind
      ).toBe(kind);
    }
  );

  it('sends a blocked request to step 1 where CORS has to be set', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('aws-s3')!} />);
    expect(
      within(section()).getByText(
        /does not allow this site yet: apply the CORS policy from the setup steps above/
      )
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

    expect(text).toContain('MinIO Community Edition exposes ETag in its own CORS answers');
    // AIStor's per-bucket rules, or a proxy, are where it can go missing.
    expect(text).toContain('per-bucket rules on MinIO AIStor');
    expect(text).not.toContain('as it is in the policy above');
  });

  it('tells Wasabi users the default exposes ETag and a saved policy is what can hide it', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('wasabi')!} />);
    expect(section().textContent).toContain(
      "Wasabi's default CORS exposes every header, so this happens once a CORS policy without ETag has been saved"
    );
  });

  it('warns on every page that AuthorizationHeaderMalformed can mean a wrong region', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('digitalocean-spaces')!} />);
    expect(section().textContent).toContain(
      'AuthorizationHeaderMalformed is filed here too, but on Amazon S3 it means the region does not match'
    );
  });

  it('says it once on the AWS page, where the provider notes already explain it', () => {
    render(<ConnectionTroubleshooting provider={getProviderBySlug('aws-s3')!} />);
    expect(section().textContent).not.toContain('AuthorizationHeaderMalformed is filed here too');
    const box = screen.getByText(/Particular to Amazon S3/).parentElement!;
    expect(box.textContent).toContain('AuthorizationHeaderMalformed');
  });

  it.each(['credentials', 'bucket', 'permissions'] as const)(
    'names in its own words only codes the classifier really files under %s',
    (kind) => {
      render(<ConnectionTroubleshooting provider={getProviderBySlug('aws-s3')!} />);
      const heading = within(section()).getByRole('heading', {
        name: `“${CONNECTION_FAILURE_TITLES[kind]}”`,
      });
      const named = [...heading.parentElement!.querySelectorAll('code')]
        .map((code) => code.textContent ?? '')
        .filter((text) => /^[A-Z][A-Za-z]+$/.test(text));

      expect(named.length).toBeGreaterThan(0);
      for (const name of named) {
        expect(classifyConnectionFailure({ name, $metadata: {} }).kind).toBe(kind);
      }
    }
  );

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
