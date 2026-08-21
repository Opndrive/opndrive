/**
 * The legal pages are prose, and they are only useful if they render without
 * JavaScript and stay honest about what the app actually does.
 *
 * These render them the way a crawler or a reader with JS disabled would see
 * them: server-rendered to a string, with nothing hydrating.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PrivacyPolicyPage from './page';
import TermsOfServicePage from '../terms/page';
import { LEGAL_LAST_UPDATED, formatLegalDate } from '@/config/legal';

const privacyHtml = renderToStaticMarkup(<PrivacyPolicyPage />);
const termsHtml = renderToStaticMarkup(<TermsOfServicePage />);

describe('privacy policy', () => {
  it('renders without needing a browser', () => {
    expect(privacyHtml).toContain('Privacy Policy');
    expect(privacyHtml.length).toBeGreaterThan(2000);
  });

  it('shows a formatted last updated date', () => {
    expect(privacyHtml).toContain(formatLegalDate(LEGAL_LAST_UPDATED));
  });

  // Every key in the table is one the app really writes. If a key is added or
  // renamed without the policy following, this is the reminder.
  it.each([
    's3_user_session',
    'ui-theme',
    'opndrive_user_settings',
    'opndrive-layout-preference',
    'delete-recovery-storage',
    'upload-settings-storage',
  ])('discloses the %s storage key', (key) => {
    expect(privacyHtml).toContain(key);
  });

  it('names the analytics rather than denying it', () => {
    expect(privacyHtml).toContain('Vercel Web Analytics');
    expect(privacyHtml).toContain('Speed Insights');
  });

  it('states the credential risk instead of glossing over it', () => {
    expect(privacyHtml).toContain('localStorage');
    expect(privacyHtml.toLowerCase()).toContain('scoped to a single bucket');
  });

  it('separates self-hosting from the hosted service', () => {
    expect(privacyHtml).toContain('self-hosting');
    expect(privacyHtml).toContain('data controller');
  });

  it('has the anchor the footer links at', () => {
    expect(privacyHtml).toContain('id="storage"');
  });

  it('does not claim we collect nothing', () => {
    expect(privacyHtml).not.toContain('Zero Data Collection');
    expect(privacyHtml).not.toMatch(/we (do not|don&#x27;t) collect (any )?(usage )?analytics/i);
  });
});

describe('terms of service', () => {
  it('renders without needing a browser', () => {
    expect(termsHtml).toContain('Terms of Service');
    expect(termsHtml.length).toBeGreaterThan(2000);
  });

  it('separates the hosted service from the software licence', () => {
    expect(termsHtml).toContain('AGPL-3.0');
  });

  it('is clear that provider charges are the user to bear', () => {
    expect(termsHtml.toLowerCase()).toContain('charge');
  });

  it('links to the privacy policy', () => {
    expect(termsHtml).toContain('/privacy');
  });
});
