import { describe, expect, it } from 'vitest';
import { redactAnalyticsEvent, redactAnalyticsUrl } from './redact-url';

describe('redactAnalyticsUrl', () => {
  describe('the leaks this exists to stop', () => {
    it('drops a search term carried in the query string', () => {
      expect(redactAnalyticsUrl('https://opndrive.app/dashboard/search?q=tax%20return')).toBe(
        'https://opndrive.app/dashboard/search'
      );
    });

    it('drops a search term carried in the hash', () => {
      expect(redactAnalyticsUrl('https://opndrive.app/dashboard/search#q=tax%20return')).toBe(
        'https://opndrive.app/dashboard/search'
      );
    });

    it('drops an object key and collapses the etag that identifies the file', () => {
      expect(
        redactAnalyticsUrl(
          'https://opndrive.app/dashboard/preview/5d41402abc4b2a76?key=invoices%2F2024%2Facme.pdf'
        )
      ).toBe('https://opndrive.app/dashboard/preview/[etag]');
    });

    it('drops an object key carried in the hash', () => {
      expect(
        redactAnalyticsUrl(
          'https://opndrive.app/dashboard/preview/5d41402abc4b2a76#key=invoices%2F2024%2Facme.pdf'
        )
      ).toBe('https://opndrive.app/dashboard/preview/[etag]');
    });

    it('drops the folder prefix and pagination token when browsing', () => {
      expect(
        redactAnalyticsUrl(
          'https://opndrive.app/dashboard/browse?prefix=personal%2Ftax&token=abc123&maxKeys=50'
        )
      ).toBe('https://opndrive.app/dashboard/browse');
    });
  });

  describe('allowlisting', () => {
    it('keeps campaign attribution', () => {
      expect(redactAnalyticsUrl('https://opndrive.app/?utm_source=hn&utm_campaign=launch')).toBe(
        'https://opndrive.app/?utm_source=hn&utm_campaign=launch'
      );
    });

    it('keeps allowed params while dropping the rest of the same query', () => {
      expect(
        redactAnalyticsUrl('https://opndrive.app/dashboard/search?q=payslip&utm_source=hn')
      ).toBe('https://opndrive.app/dashboard/search?utm_source=hn');
    });

    it('drops params nobody has thought about yet', () => {
      expect(redactAnalyticsUrl('https://opndrive.app/somewhere?email=a@b.com&token=xyz')).toBe(
        'https://opndrive.app/somewhere'
      );
    });
  });

  describe('urls it should leave alone', () => {
    it('passes through a plain marketing route', () => {
      expect(redactAnalyticsUrl('https://opndrive.app/connect')).toBe(
        'https://opndrive.app/connect'
      );
    });

    it('keeps non-dynamic dashboard routes intact', () => {
      expect(redactAnalyticsUrl('https://opndrive.app/dashboard/settings')).toBe(
        'https://opndrive.app/dashboard/settings'
      );
    });

    it('preserves the origin, including localhost with a port', () => {
      expect(redactAnalyticsUrl('http://localhost:3000/dashboard/search?q=secret')).toBe(
        'http://localhost:3000/dashboard/search'
      );
    });

    it('returns a relative url as relative', () => {
      expect(redactAnalyticsUrl('/dashboard/search?q=secret')).toBe('/dashboard/search');
    });
  });

  describe('robustness', () => {
    // Anything that is not a URL resolves against the parse base as a relative
    // path, so it comes back stripped of query and hash rather than throwing.
    it('treats junk as a relative path and still strips the query', () => {
      expect(redactAnalyticsUrl('not a url?q=secret')).toBe('/not%20a%20url');
    });

    it('never throws, whatever it is handed', () => {
      const inputs = ['', '   ', '//', '???', 'http://', '\\\\', 'javascript:alert(1)'];

      for (const input of inputs) {
        expect(() => redactAnalyticsUrl(input)).not.toThrow();
      }
    });

    it('returns the empty-string case as a bare path', () => {
      expect(redactAnalyticsUrl('')).toBe('/');
    });

    it('collapses the etag even when no key is present', () => {
      expect(redactAnalyticsUrl('https://opndrive.app/dashboard/preview/abc123')).toBe(
        'https://opndrive.app/dashboard/preview/[etag]'
      );
    });
  });
});

describe('redactAnalyticsEvent', () => {
  it('redacts the url and keeps the event', () => {
    expect(
      redactAnalyticsEvent({
        type: 'pageview',
        url: 'https://opndrive.app/dashboard/search?q=medical',
      })
    ).toEqual({ type: 'pageview', url: 'https://opndrive.app/dashboard/search' });
  });

  it('preserves fields it does not know about', () => {
    expect(
      redactAnalyticsEvent({
        type: 'vital',
        url: 'https://opndrive.app/dashboard/preview/abc?key=a%2Fb.pdf',
        route: '/dashboard/preview/[etag]',
      })
    ).toEqual({
      type: 'vital',
      url: 'https://opndrive.app/dashboard/preview/[etag]',
      route: '/dashboard/preview/[etag]',
    });
  });

  it('does not mutate the event it was given', () => {
    const event = { type: 'pageview' as const, url: 'https://opndrive.app/x?q=secret' };
    redactAnalyticsEvent(event);

    expect(event.url).toBe('https://opndrive.app/x?q=secret');
  });
});
