import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SiteFooter } from './site-footer';

describe('SiteFooter', () => {
  it('links to both legal pages', () => {
    render(<SiteFooter />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/privacy'
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe(
      '/terms'
    );
  });

  it('points the storage link at the section anchor', () => {
    render(<SiteFooter />);

    expect(screen.getByRole('link', { name: 'Cookies and storage' }).getAttribute('href')).toBe(
      '/privacy#storage'
    );
  });

  // This line is where a visitor learns what we measure and how to stop it,
  // which is the job a consent banner would otherwise be doing badly.
  it('says what we measure and offers a way out', () => {
    render(<SiteFooter />);

    expect(screen.getByText(/cookieless analytics/i)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Opt out' })).toBeDefined();
  });

  it('groups the legal links under their own heading', () => {
    render(<SiteFooter />);

    const legalHeading = screen.getByRole('heading', { name: 'Legal' });
    const legalColumn = legalHeading.parentElement;

    expect(legalColumn).not.toBeNull();
    expect(
      within(legalColumn as HTMLElement).getByRole('link', { name: /Privacy Policy/ })
    ).toBeDefined();
  });

  it('opens external links safely', () => {
    render(<SiteFooter />);

    for (const link of screen.getAllByRole('link')) {
      if (link.getAttribute('target') === '_blank') {
        expect(link.getAttribute('rel')).toContain('noopener');
      }
    }
  });
});
