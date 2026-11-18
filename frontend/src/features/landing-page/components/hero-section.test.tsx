/**
 * Which hero copy loads first, in the two ways the hero gets rendered.
 *
 * Server HTML: both copies lazy, plus the inline script that promotes the
 * visible one while the page parses. Client-only render (client-side
 * navigation to the landing page): React would never run a script it creates,
 * so the hero promotes the visible copy itself and renders no script.
 */
import { renderToString } from 'react-dom/server';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/hooks/use-github-stars', () => ({
  useOpndriveStars: () => ({ stars: null }),
}));

import HeroSection from './hero-section';
import { HERO_THEME_ATTRIBUTE } from '@/features/landing-page/hero-image-priority';

const SCRIPT = <script data-testid="priority-script" />;

function hero() {
  return (
    <HeroSection handleGetStarted={() => {}} ctaLabel="Get Started" imagePriorityScript={SCRIPT} />
  );
}

beforeEach(() => {
  // jsdom has no matchMedia; the system theme here is light, and the stamped
  // data-theme decides anyway.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

describe('hero image priority', () => {
  it('marks its images with the attribute the priority script looks for', () => {
    // The markup writes the attribute out; the script builds its selector from
    // the constant. Renaming one without the other would promote nothing.
    const { container } = render(hero());
    expect(container.querySelectorAll(`img[${HERO_THEME_ATTRIBUTE}]`)).toHaveLength(2);
  });

  it('leaves both copies lazy in the server HTML and sends the script with them', () => {
    const html = renderToString(hero());
    const images = html.match(/<img[^>]*data-hero-theme="(?:light|dark)"[^>]*>/g) ?? [];

    expect(images).toHaveLength(2);
    for (const img of images) {
      expect(img).toContain('loading="lazy"');
      expect(img).not.toContain('fetchPriority');
      expect(img).not.toContain('fetchpriority');
    }
    expect(html).toContain('data-testid="priority-script"');
  });

  it.each(['light', 'dark'] as const)(
    'promotes the %s copy itself on a client-only render, with no script',
    (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      const { container } = render(hero());

      const other = theme === 'light' ? 'dark' : 'light';
      const shown = container.querySelector(`img[${HERO_THEME_ATTRIBUTE}="${theme}"]`)!;
      const hidden = container.querySelector(`img[${HERO_THEME_ATTRIBUTE}="${other}"]`)!;

      expect(shown.getAttribute('loading')).toBe('eager');
      expect(shown.getAttribute('fetchpriority')).toBe('high');
      // The hidden copy stays lazy, or it downloads too.
      expect(hidden.getAttribute('loading')).toBe('lazy');
      expect(hidden.hasAttribute('fetchpriority')).toBe(false);
      expect(container.querySelector('[data-testid="priority-script"]')).toBeNull();
    }
  );

  it('keeps the copy it promoted when the theme changes later', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const { container, rerender } = render(hero());

    document.documentElement.setAttribute('data-theme', 'dark');
    rerender(hero());

    // Decided once: a re-render does not move the attributes between copies.
    const light = container.querySelector(`img[${HERO_THEME_ATTRIBUTE}="light"]`)!;
    const dark = container.querySelector(`img[${HERO_THEME_ATTRIBUTE}="dark"]`)!;
    expect(light.getAttribute('fetchpriority')).toBe('high');
    expect(dark.hasAttribute('fetchpriority')).toBe(false);
  });
});
