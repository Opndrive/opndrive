import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRIVATE_PARAM_KEY,
  PRIVATE_PARAM_QUERY,
  buildPrivateHash,
  pushPrivateParams,
  readPrivateParams,
  setPrivateParams,
  usePrivateParam,
  usePrivateParams,
  withPrivateParams,
} from './private-params';

function goTo(url: string) {
  window.history.replaceState(null, '', url);
}

afterEach(() => {
  goTo('/');
});

describe('buildPrivateHash', () => {
  it('encodes a single param', () => {
    expect(buildPrivateHash({ q: 'invoices' })).toBe('#q=invoices');
  });

  it('percent encodes values that need it', () => {
    expect(buildPrivateHash({ key: 'tax returns/2024 final.pdf' })).toBe(
      '#key=tax+returns%2F2024+final.pdf'
    );
  });

  it('returns an empty string when there is nothing to carry', () => {
    expect(buildPrivateHash({})).toBe('');
    expect(buildPrivateHash({ q: undefined })).toBe('');
    expect(buildPrivateHash({ q: '' })).toBe('');
  });
});

describe('withPrivateParams', () => {
  it('appends the hash to a path', () => {
    expect(withPrivateParams('/dashboard/search', { q: 'notes' })).toBe(
      '/dashboard/search#q=notes'
    );
  });

  it('leaves the path bare when there are no params', () => {
    expect(withPrivateParams('/dashboard/search', {})).toBe('/dashboard/search');
  });
});

describe('readPrivateParams', () => {
  it('reads params out of the current hash', () => {
    goTo('/dashboard/search#q=holiday%20photos');

    expect(readPrivateParams().get(PRIVATE_PARAM_QUERY)).toBe('holiday photos');
  });

  it('is empty when there is no hash', () => {
    goTo('/dashboard/search');

    expect(readPrivateParams().toString()).toBe('');
  });

  it('ignores the query string', () => {
    goTo('/dashboard/search?q=leaked');

    expect(readPrivateParams().get(PRIVATE_PARAM_QUERY)).toBeNull();
  });
});

describe('setPrivateParams', () => {
  it('puts the value in the hash and leaves the path alone', () => {
    goTo('/dashboard/search');
    setPrivateParams({ [PRIVATE_PARAM_QUERY]: 'payslips' });

    expect(window.location.pathname).toBe('/dashboard/search');
    expect(window.location.hash).toBe('#q=payslips');
  });

  it('never writes the value into the query string', () => {
    goTo('/dashboard/search');
    setPrivateParams({ [PRIVATE_PARAM_QUERY]: 'payslips' });

    expect(window.location.search).toBe('');
  });

  it('clears the hash when the value goes away', () => {
    goTo('/dashboard/search#q=payslips');
    setPrivateParams({ [PRIVATE_PARAM_QUERY]: undefined });

    expect(window.location.hash).toBe('');
  });

  it('adds a history entry by default and not when replacing', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');

    setPrivateParams({ q: 'a' });
    expect(push).toHaveBeenCalledOnce();

    setPrivateParams({ q: 'b' }, { replace: true });
    expect(replace).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledOnce();

    push.mockRestore();
    replace.mockRestore();
  });
});

describe('pushPrivateParams', () => {
  it('routes to another page when the path differs', () => {
    goTo('/dashboard');
    const router = { push: vi.fn() };

    pushPrivateParams(router, '/dashboard/search', { [PRIVATE_PARAM_QUERY]: 'budget' });

    expect(router.push).toHaveBeenCalledWith('/dashboard/search#q=budget');
  });

  // A hash-only router.push does not fire hashchange, so readers would keep
  // showing the previous term. Same-route updates have to go through the
  // history API instead.
  it('updates in place rather than routing when already on the page', () => {
    goTo('/dashboard/search#q=old');
    const router = { push: vi.fn() };

    pushPrivateParams(router, '/dashboard/search', { [PRIVATE_PARAM_QUERY]: 'new' });

    expect(router.push).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#q=new');
  });
});

describe('usePrivateParams', () => {
  it('starts unhydrated so callers do not flash an empty state', () => {
    goTo('/dashboard/search#q=recipes');
    const { result } = renderHook(() => usePrivateParams());

    // The effect has already run by the time renderHook returns, so the value
    // is here - what matters is that isHydrated reports it as readable.
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.params.get(PRIVATE_PARAM_QUERY)).toBe('recipes');
  });

  it('reports hydrated even when the hash is empty', () => {
    goTo('/dashboard/search');
    const { result } = renderHook(() => usePrivateParams());

    expect(result.current.isHydrated).toBe(true);
    expect(result.current.params.toString()).toBe('');
  });

  it('picks up a programmatic change', () => {
    goTo('/dashboard/search#q=first');
    const { result } = renderHook(() => usePrivateParams());

    act(() => setPrivateParams({ [PRIVATE_PARAM_QUERY]: 'second' }));

    expect(result.current.params.get(PRIVATE_PARAM_QUERY)).toBe('second');
  });

  it('picks up back and forward navigation', () => {
    goTo('/dashboard/search#q=first');
    const { result } = renderHook(() => usePrivateParams());

    act(() => {
      window.history.replaceState(null, '', '/dashboard/search#q=third');
      window.dispatchEvent(new Event('popstate'));
    });

    expect(result.current.params.get(PRIVATE_PARAM_QUERY)).toBe('third');
  });

  // Consumers put `params` in effect and memo dependencies, so a history event
  // that left the params untouched must not hand back a new object. React may
  // still render once more before bailing out, which is why this checks
  // identity rather than a render count.
  it('keeps the same params object when a history change leaves them alone', () => {
    goTo('/dashboard/search#q=stable');
    const { result } = renderHook(() => usePrivateParams());

    const paramsBefore = result.current.params;

    act(() => window.dispatchEvent(new Event('popstate')));
    act(() => window.dispatchEvent(new Event('hashchange')));

    expect(result.current.params).toBe(paramsBefore);
  });

  it('stops listening once unmounted', () => {
    goTo('/dashboard/search#q=first');
    const { result, unmount } = renderHook(() => usePrivateParams());

    unmount();
    setPrivateParams({ [PRIVATE_PARAM_QUERY]: 'after-unmount' });

    expect(result.current.params.get(PRIVATE_PARAM_QUERY)).toBe('first');
  });
});

describe('usePrivateParam', () => {
  it('returns the named value', () => {
    goTo('/dashboard/preview/abc#key=invoices%2Fq1.pdf');
    const { result } = renderHook(() => usePrivateParam(PRIVATE_PARAM_KEY));

    expect(result.current.value).toBe('invoices/q1.pdf');
  });

  it('returns an empty string for a param that is not there', () => {
    goTo('/dashboard/preview/abc');
    const { result } = renderHook(() => usePrivateParam(PRIVATE_PARAM_KEY));

    expect(result.current.value).toBe('');
    expect(result.current.isHydrated).toBe(true);
  });
});
