import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAGE_PROFILE_GLOBAL } from '@/lib/privacy/page-profile';
import { PublicPolicyReload } from './public-policy-reload';

const globals = window as unknown as Record<string, unknown>;

function stubReload() {
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  return reload;
}

afterEach(() => {
  delete globals[PAGE_PROFILE_GLOBAL];
  vi.unstubAllGlobals();
});

describe('an app page reached from a public page', () => {
  it('loads again under its own policy', () => {
    globals[PAGE_PROFILE_GLOBAL] = 'public';
    const reload = stubReload();

    render(<PublicPolicyReload />);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stays put when the document already has the app policy', () => {
    globals[PAGE_PROFILE_GLOBAL] = 'app';
    const reload = stubReload();

    render(<PublicPolicyReload />);

    expect(reload).not.toHaveBeenCalled();
  });
});
