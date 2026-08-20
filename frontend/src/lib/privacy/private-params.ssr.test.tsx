/**
 * Hydration safety for hash-backed params.
 *
 * The server cannot see a URL hash, so a component reading one renders
 * differently there than it eventually does in the browser. That is only safe
 * if the *first* client render still matches the server - the real value has
 * to arrive in an effect, after hydration has committed, rather than during
 * the render itself.
 *
 * Note which test does the real work here. These run under jsdom, where
 * `renderToString` can see the same `window` the client does, so a hook that
 * wrongly read the hash during render would produce *matching* markup on both
 * sides and hydrate without complaint. The hydration cases below therefore
 * cannot catch that regression, and are here to pin the settled behaviour.
 *
 * The `server rendering` case is the guard: it asserts the rendered markup
 * does not contain the hash value, which fails the moment anything reads it
 * during render. Verified by breaking the hook on purpose - that case failed
 * and the hydration cases did not.
 */

import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRIVATE_PARAM_QUERY, usePrivateParam } from './private-params';

function Probe() {
  const { value, isHydrated } = usePrivateParam(PRIVATE_PARAM_QUERY);

  return (
    <div>
      <span data-testid="value">{value || 'none'}</span>
      <span data-testid="ready">{isHydrated ? 'ready' : 'waiting'}</span>
    </div>
  );
}

let container: HTMLDivElement;

beforeEach(() => {
  window.history.replaceState(null, '', '/dashboard/search#q=confidential');
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  window.history.replaceState(null, '', '/');
});

describe('server rendering', () => {
  it('renders the waiting state, because the server cannot see the hash', () => {
    const html = renderToString(<Probe />);

    expect(html).toContain('none');
    expect(html).toContain('waiting');
    expect(html).not.toContain('confidential');
  });
});

describe('hydration', () => {
  it('hydrates the server markup without a mismatch', () => {
    const html = renderToString(<Probe />);
    container.innerHTML = html;

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    act(() => {
      hydrateRoot(container, <Probe />);
    });

    const messages = errors.mock.calls.map((call) => String(call[0]));
    errors.mockRestore();

    expect(messages.filter((message) => /hydrat|did not match|server HTML/i.test(message))).toEqual(
      []
    );
  });

  it('shows the real value once hydration has settled', () => {
    container.innerHTML = renderToString(<Probe />);

    act(() => {
      hydrateRoot(container, <Probe />);
    });

    expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('confidential');
    expect(container.querySelector('[data-testid="ready"]')?.textContent).toBe('ready');
  });

  it('hydrates cleanly when there is no hash at all', () => {
    window.history.replaceState(null, '', '/dashboard/search');
    container.innerHTML = renderToString(<Probe />);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    act(() => {
      hydrateRoot(container, <Probe />);
    });

    const messages = errors.mock.calls.map((call) => String(call[0]));
    errors.mockRestore();

    expect(messages.filter((message) => /hydrat|did not match|server HTML/i.test(message))).toEqual(
      []
    );
    expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('none');
  });
});
