/**
 * Section headings: each gets an address, links to it, keeps its name for a
 * screen reader, and is listed for the table of contents.
 */
import { describe, expect, it } from 'vitest';
import { renderPostContent } from './render';

async function render(html: string) {
  const rendered = await renderPostContent(html);
  const root = document.createElement('div');
  root.innerHTML = rendered.html;
  return { root, headings: rendered.headings };
}

describe('section headings', () => {
  it('keeps the ids WordPress wrote and lists the headings in order', async () => {
    const { headings } = await render(
      '<h2 id="the-decision-order">The decision order</h2><h3 id="read-the-url">Read the URL</h3><h2 id="faq">FAQ</h2>'
    );

    expect(headings).toEqual([
      { id: 'the-decision-order', text: 'The decision order', level: 2 },
      { id: 'read-the-url', text: 'Read the URL', level: 3 },
      { id: 'faq', text: 'FAQ', level: 2 },
    ]);
  });

  it('gives a heading without an id one from its text, never one already taken', async () => {
    const { root, headings } = await render(
      '<h2 id="setup">Old</h2><h2>Setup</h2><h3>Setup</h3><h2>Fix &amp; retry</h2>'
    );

    const ids = headings.map((heading) => heading.id);
    expect(ids).toEqual(['setup', 'setup-1', 'setup-2', 'fix--retry']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(root.querySelector('h2:nth-of-type(2)')?.id).toBe('setup-1');
  });

  it('turns the heading text into a link to its own section', async () => {
    const { root } = await render('<h2 id="step-1">Step 1: <code>curl</code> it</h2>');

    const link = root.querySelector('h2 > a.heading-anchor');
    expect(link?.getAttribute('href')).toBe('#step-1');
    expect(link?.hasAttribute('data-heading-anchor')).toBe(true);
    expect(link?.querySelector('code')?.textContent).toBe('curl');
  });

  it('keeps the heading name as it was: the icon is hidden and adds no text', async () => {
    const { root } = await render('<h2 id="a">Replay the request</h2>');

    const heading = root.querySelector('h2')!;
    expect(heading.textContent).toBe('Replay the request');
    expect(heading.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves a heading that already holds a link alone, since links cannot nest', async () => {
    const { root, headings } = await render('<h2>See <a href="/docs">the docs</a></h2>');

    expect(root.querySelector('.heading-anchor')).toBeNull();
    expect(root.querySelector('h2 a')?.getAttribute('href')).toBe('/docs');
    // Still addressable, and still listed.
    expect(root.querySelector('h2')?.id).toBe('see-the-docs');
    expect(headings).toHaveLength(1);
  });

  it("never gives a heading one of the page's own ids", async () => {
    const { headings } = await render('<h2>Get started</h2><h2>FAQ</h2>');

    expect(headings.map((heading) => heading.id)).toEqual(['get-started-1', 'faq-1']);
  });

  it('skips empty headings', async () => {
    const { headings } = await render('<h2></h2><h2>Real</h2>');
    expect(headings.map((heading) => heading.text)).toEqual(['Real']);
  });
});
