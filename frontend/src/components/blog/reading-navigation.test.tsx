/**
 * Getting around a long post: the table of contents, the links on section
 * headings, and the way back to the top.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TableOfContents } from './table-of-contents';
import { ReadingAids } from './reading-aids';
import { BlogPostContent } from './blog-post-content';
import { renderPostContent } from '@/lib/blog-content/render';
import type { PostHeading } from '@/lib/blog-content/headings';

const headings: PostHeading[] = [
  { id: 'intro', text: 'Intro', level: 2 },
  { id: 'step-1', text: 'Step 1', level: 2 },
  { id: 'read-the-url', text: 'Read the URL', level: 3 },
  { id: 'step-2', text: 'Step 2', level: 2 },
  { id: 'replay', text: 'Replay it', level: 3 },
];

/** Places each heading on the page `top` pixels from the top of the window. */
function placeHeadings(tops: Record<string, number>) {
  for (const [id, top] of Object.entries(tops)) {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement('h2');
      element.id = id;
      document.body.appendChild(element);
    }
    element.getBoundingClientRect = () => ({ top }) as DOMRect;
  }
}

let observerCallback: (() => void) | null = null;

beforeEach(() => {
  observerCallback = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: () => void) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TableOfContents, beside the post', () => {
  it('marks the section being read and opens its subsections only', () => {
    placeHeadings({
      intro: -800,
      'step-1': -200,
      'read-the-url': 600,
      'step-2': 1400,
      replay: 2000,
    });
    render(<TableOfContents headings={headings} variant="sidebar" />);

    const nav = screen.getByRole('navigation', { name: 'On this page' });
    const current = within(nav).getByRole('link', { current: 'location' });
    expect(current.textContent).toBe('Step 1');
    expect(within(nav).getByRole('link', { name: 'Read the URL' })).toBeDefined();
    // Step 2's subsection stays folded until Step 2 is being read.
    expect(within(nav).queryByRole('link', { name: 'Replay it' })).toBeNull();
  });

  it('moves the mark when a heading crosses the reading line', () => {
    placeHeadings({
      intro: -800,
      'step-1': -200,
      'read-the-url': -100,
      'step-2': 1400,
      replay: 2000,
    });
    render(<TableOfContents headings={headings} variant="sidebar" />);

    placeHeadings({
      intro: -3000,
      'step-1': -2400,
      'read-the-url': -2300,
      'step-2': 100,
      replay: 900,
    });
    act(() => observerCallback?.());

    const nav = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(nav).getByRole('link', { current: 'location' }).textContent).toBe('Step 2');
    expect(within(nav).getByRole('link', { name: 'Replay it' })).toBeDefined();
    expect(within(nav).queryByRole('link', { name: 'Read the URL' })).toBeNull();
  });

  it('links each entry to its section', () => {
    render(<TableOfContents headings={headings} variant="sidebar" />);
    expect(screen.getByRole('link', { name: 'Step 2' }).getAttribute('href')).toBe('#step-2');
  });
});

describe('TableOfContents, above the post', () => {
  it('lists the top-level sections in a closed panel that closes again after a pick', () => {
    const { container } = render(<TableOfContents headings={headings} variant="collapsible" />);
    const details = container.querySelector('details')!;

    expect(details.open).toBe(false);
    const links = within(details).getAllByRole('link', { hidden: true });
    expect(links.map((link) => link.textContent)).toEqual(['Intro', 'Step 1', 'Step 2']);

    details.open = true;
    fireEvent.click(links[1]!);
    expect(details.open).toBe(false);
  });
});

describe('ReadingAids', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  function mount() {
    document.body.innerHTML =
      '<h1 id="post-title" tabindex="-1">Title</h1><article id="post-body"></article>';
    const article = document.getElementById('post-body')!;
    return { article, ...render(<ReadingAids articleId="post-body" titleId="post-title" />) };
  }

  it('shows "Back to top" only once the reader is well into the post', () => {
    const { article } = mount();
    const button = screen.getByRole('button', { name: 'Back to top', hidden: true });
    expect(button.className).toContain('invisible');

    article.getBoundingClientRect = () => ({ top: -2000, height: 6000 }) as DOMRect;
    Object.defineProperty(window, 'scrollY', { value: 2400, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(button.className).not.toContain('invisible');
  });

  it('goes back to the top and puts focus on the title', () => {
    mount();
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    fireEvent.click(screen.getByRole('button', { name: 'Back to top', hidden: true }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(document.activeElement?.id).toBe('post-title');
  });
});

describe('section heading links', () => {
  let html: string;

  beforeAll(async () => {
    html = (await renderPostContent('<h2 id="step-2">Step 2</h2><p>Body.</p>')).html;
  });

  it('copy the section address and say so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<BlogPostContent html={html} />);

    fireEvent.click(screen.getByRole('link', { name: 'Step 2' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/#step-2$/)));
    expect(await screen.findByText('Link to this section copied')).toBeDefined();
  });

  it('leave a modified click (new tab) to the browser', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<BlogPostContent html={html} />);

    fireEvent.click(screen.getByRole('link', { name: 'Step 2' }), { ctrlKey: true });

    expect(writeText).not.toHaveBeenCalled();
  });
});
