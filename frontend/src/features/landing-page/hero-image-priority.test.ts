import { afterEach, describe, expect, it, vi } from 'vitest';
import { HERO_IMAGE_PRIORITY_SCRIPT, HERO_THEME_ATTRIBUTE } from './hero-image-priority';

function setUp(theme: string | null, systemDark = false) {
  document.documentElement.removeAttribute('data-theme');
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  document.body.innerHTML = `
    <img ${HERO_THEME_ATTRIBUTE}="light" loading="lazy" alt="">
    <img ${HERO_THEME_ATTRIBUTE}="dark" loading="lazy" alt="">
  `;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: systemDark && query.includes('dark'),
  }));
}

function run() {
  // The same text the page ships in a nonce'd <script>.
  new Function(HERO_IMAGE_PRIORITY_SCRIPT)();
}

const image = (theme: string) => document.querySelector(`img[${HERO_THEME_ATTRIBUTE}="${theme}"]`)!;

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';
});

describe('hero image priority script', () => {
  it.each(['light', 'dark'])('promotes only the %s copy when that theme is set', (theme) => {
    setUp(theme);
    run();

    const other = theme === 'light' ? 'dark' : 'light';
    expect(image(theme).getAttribute('loading')).toBe('eager');
    expect(image(theme).getAttribute('fetchpriority')).toBe('high');
    // The hidden copy has to stay lazy, or it downloads too.
    expect(image(other).getAttribute('loading')).toBe('lazy');
    expect(image(other).hasAttribute('fetchpriority')).toBe(false);
  });

  it('follows the system setting when no theme has been stamped', () => {
    setUp(null, true);
    run();

    expect(image('dark').getAttribute('loading')).toBe('eager');
    expect(image('light').getAttribute('loading')).toBe('lazy');
  });

  it('does nothing, and does not throw, when the hero is not on the page', () => {
    setUp('dark');
    document.body.innerHTML = '';
    expect(run).not.toThrow();
  });
});
