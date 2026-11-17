import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SetupGuide } from './setup-guide';
import { S3_PROVIDERS } from '@/config/providers';
import { DOCS_URL } from '@/config/links';

describe('SetupGuide', () => {
  it.each(S3_PROVIDERS.map((provider) => [provider.name, provider] as const))(
    'tells %s users how to clean up interrupted uploads',
    (_name, provider) => {
      render(<SetupGuide provider={provider} corsConfig="" />);

      // A closed tab leaves multipart parts behind that no listing shows and
      // the browser can never come back for. Only a bucket rule removes them.
      const link = screen.getByRole('link', { name: 'How to add the rule' });
      expect(link.getAttribute('href')).toBe(
        `${DOCS_URL}/guides/uploading-files#required-clean-up-incomplete-multipart-uploads`
      );
    }
  );
});
