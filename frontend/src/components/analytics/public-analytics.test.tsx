import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Self-hosted copies and default builds send nothing. These pin the two halves
 * of that: with no key and host the component renders nothing and makes no
 * request, and the build is told to turn an unset variable into "" so it can
 * leave the sending code out. CI then checks a real build for what is left.
 */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('a build without analytics configured', () => {
  it.each([
    ['neither', '', ''],
    ['only a key', 'phc_test', ''],
    ['only a host', '', 'https://us.i.posthog.com'],
  ])('with %s, renders nothing and sends nothing', async (_, key, host) => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key);
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', host);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const { PublicAnalytics } = await import('./public-analytics');
    const { container } = render(<PublicAnalytics />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.innerHTML).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('the build settings that keep analytics code out', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

  it.each([
    ['the app', ['next.config.ts']],
    ['the docs site', ['..', 'docs', 'next.config.mjs']],
  ])('%s defines an unset key and host as empty', (_, path) => {
    const config = read(...path);
    expect(config).toContain("NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ''");
    expect(config).toContain(
      "NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? ''"
    );
  });

  it('has no key or host in the Docker build', () => {
    expect(read('..', 'Dockerfile')).not.toMatch(/POSTHOG|phc_/);
  });
});
