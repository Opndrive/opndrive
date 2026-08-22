/**
 * ProviderMark returns null for a slug it has no visual for.
 *
 * That is the right behaviour - better an empty space than a crash - but it
 * means a provider added to the registry without a matching entry in
 * PROVIDER_VISUALS ships a card with a hole where the logo goes, and nothing
 * anywhere reports it. Rendering each one is the only way to catch that.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { S3_PROVIDERS } from '@/config/providers';
import { ProviderMark } from './provider-mark';

describe('ProviderMark', () => {
  it.each(S3_PROVIDERS.map((provider) => [provider.slug, provider] as const))(
    'renders a mark for %s',
    (_slug, provider) => {
      const html = renderToStaticMarkup(<ProviderMark provider={provider} />);

      expect(html).not.toBe('');
      expect(html).toContain('<svg');
    }
  );

  it('keeps the glyph out of the accessibility tree', () => {
    const html = renderToStaticMarkup(<ProviderMark provider={S3_PROVIDERS[0]!} />);

    // The provider name is always rendered beside it, so a second reading of
    // the same word is noise.
    expect(html).toContain('aria-hidden="true"');
  });
});
