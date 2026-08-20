/**
 * Hydration and sync for the opt-out control.
 *
 * This is the one piece of the consent system that renders real DOM from a
 * value the server cannot see. The gate renders nothing either way, so it
 * cannot mismatch; a switch whose checked state comes from a cookie very much
 * can. If it rendered the true value during the first client render, React
 * would find markup that disagrees with the server's and the switch could end
 * up showing the opposite of the truth.
 *
 * @vitest-environment-options { "url": "https://opndrive.app/" }
 */

import { act, render, renderHook, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsOptOut } from './analytics-opt-out';
import { setAnalyticsOptOut, useConsent } from '@/lib/privacy/consent';

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0];
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
}

beforeEach(() => {
  clearCookies();
  localStorage.clear();
});

afterEach(() => {
  clearCookies();
  localStorage.clear();
});

describe('server rendering', () => {
  // The server has no cookie, so it must render the default and let the effect
  // correct it. Rendering the real value here is the bug this guards.
  it('renders the default position even when the visitor has opted out', () => {
    setAnalyticsOptOut(true);

    const html = renderToString(<AnalyticsOptOut />);

    expect(html).toContain('data-state="checked"');
    expect(html).toContain('disabled');
  });
});

describe('hydration', () => {
  it('hydrates an opted-out visitor without a mismatch', () => {
    setAnalyticsOptOut(true);

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = renderToString(<AnalyticsOptOut />);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    act(() => {
      hydrateRoot(container, <AnalyticsOptOut />);
    });

    const messages = errors.mock.calls.map((call) => String(call[0]));
    errors.mockRestore();

    expect(messages.filter((message) => /hydrat|did not match|server HTML/i.test(message))).toEqual(
      []
    );

    // And having hydrated, it must end up showing the truth.
    expect(container.querySelector('[role="switch"]')?.getAttribute('data-state')).toBe(
      'unchecked'
    );

    container.remove();
  });
});

describe('the control itself', () => {
  it('is disabled until the preference has been read', () => {
    const html = renderToString(<AnalyticsOptOut />);

    expect(html).toContain('disabled');
  });

  it('is enabled and on once resolved, for a visitor who never chose', () => {
    render(<AnalyticsOptOut />);

    const toggle = screen.getByRole('switch');

    expect(toggle.getAttribute('data-state')).toBe('checked');
    expect(toggle.hasAttribute('disabled')).toBe(false);
  });

  it('reflects an opt-out that was already stored', () => {
    setAnalyticsOptOut(true);

    render(<AnalyticsOptOut />);

    expect(screen.getByRole('switch').getAttribute('data-state')).toBe('unchecked');
  });

  it('says something different depending on the position', () => {
    const { unmount } = render(<AnalyticsOptOut />);
    expect(screen.getByText(/we stop counting yours/i)).toBeDefined();
    unmount();

    setAnalyticsOptOut(true);
    render(<AnalyticsOptOut />);
    expect(screen.getByText(/not counting your visits/i)).toBeDefined();
  });
});

describe('two consumers stay in step', () => {
  // The gate and this control are both mounted at once on the privacy page.
  // If they read independently rather than sharing the event, one could keep
  // running analytics after the other showed it as off.
  it('a change made in one place reaches a separate subscriber', () => {
    const { result } = renderHook(() => useConsent());
    render(<AnalyticsOptOut />);

    expect(result.current.analytics).toBe(true);

    act(() => setAnalyticsOptOut(true));

    expect(result.current.analytics).toBe(false);
    expect(screen.getByRole('switch').getAttribute('data-state')).toBe('unchecked');
  });

  it('survives being toggled repeatedly without drifting', () => {
    const { result } = renderHook(() => useConsent());

    for (let i = 0; i < 5; i += 1) {
      act(() => setAnalyticsOptOut(true));
      expect(result.current.analytics).toBe(false);

      act(() => setAnalyticsOptOut(false));
      expect(result.current.analytics).toBe(true);
    }

    // Back to the state a visitor who never acted would be in.
    expect(document.cookie).not.toContain('opndrive_privacy');
    expect(localStorage.getItem('opndrive_privacy')).toBeNull();
  });
});
