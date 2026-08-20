/**
 * The gate is the thing that actually stops analytics loading, so these test
 * the mount, not the intent.
 *
 * `<Analytics />` and `<SpeedInsights />` are stubbed to record whether they
 * were rendered at all. That is the real question: both inject a script when
 * they mount, so anything short of not rendering them is too late.
 *
 * @vitest-environment-options { "url": "https://opndrive.app/" }
 */

import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mounted = vi.hoisted(() => ({ analytics: 0, speedInsights: 0, beforeSend: [] as unknown[] }));

vi.mock('@vercel/analytics/next', () => ({
  Analytics: (props: { beforeSend?: unknown }) => {
    mounted.analytics += 1;
    mounted.beforeSend.push(props.beforeSend);
    return null;
  },
}));

vi.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: (props: { beforeSend?: unknown }) => {
    mounted.speedInsights += 1;
    mounted.beforeSend.push(props.beforeSend);
    return null;
  },
}));

import { AnalyticsGate } from './analytics-gate';
import { CONSENT_COOKIE_NAME, setAnalyticsOptOut } from '@/lib/privacy/consent';

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0];
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
}

beforeEach(() => {
  mounted.analytics = 0;
  mounted.speedInsights = 0;
  mounted.beforeSend = [];
  clearCookies();
  localStorage.clear();
});

afterEach(() => {
  clearCookies();
  localStorage.clear();
});

describe('AnalyticsGate', () => {
  it('mounts analytics by default, since it runs on legitimate interests', () => {
    render(<AnalyticsGate />);

    expect(mounted.analytics).toBe(1);
    expect(mounted.speedInsights).toBe(1);
  });

  it('passes a redaction handler to both', () => {
    render(<AnalyticsGate />);

    expect(mounted.beforeSend).toHaveLength(2);
    for (const handler of mounted.beforeSend) {
      expect(typeof handler).toBe('function');
    }
  });

  // The point of the whole stage: opting out must stop the script loading, not
  // merely filter the events it sends.
  it('never mounts anything once the visitor has opted out', () => {
    setAnalyticsOptOut(true);

    render(<AnalyticsGate />);

    expect(mounted.analytics).toBe(0);
    expect(mounted.speedInsights).toBe(0);
  });

  it('honours an opt-out that arrived as a cookie from the docs site', () => {
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(
      JSON.stringify({ v: 1, analytics: false, updatedAt: '2026-01-01T00:00:00.000Z' })
    )}; Path=/`;

    render(<AnalyticsGate />);

    expect(mounted.analytics).toBe(0);
  });

  it('mounts again after the visitor opts back in', () => {
    setAnalyticsOptOut(true);
    setAnalyticsOptOut(false);

    render(<AnalyticsGate />);

    expect(mounted.analytics).toBe(1);
  });

  it('renders no DOM of its own either way', () => {
    const { container } = render(<AnalyticsGate />);

    expect(container.innerHTML).toBe('');
  });
});
