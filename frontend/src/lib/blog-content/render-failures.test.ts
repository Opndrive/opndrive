/**
 * The body pipeline never costs a reader the post: without a highlighter the
 * code is framed and uncoloured, a block a grammar chokes on stays as written,
 * and if rendering fails outright the page gets WordPress's HTML, sanitized,
 * or as plain text when even that cannot be done. Never unsanitized.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const highlighter = vi.hoisted(() => ({ impl: null as null | (() => Promise<unknown>) }));
const parsing = vi.hoisted(() => ({ fail: false }));
const tables = vi.hoisted(() => ({ fail: false }));

vi.mock('./tables', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tables')>();
  return {
    ...actual,
    wrapTables: (...args: Parameters<typeof actual.wrapTables>) => {
      if (tables.fail) throw new Error('a step failed');
      return actual.wrapTables(...args);
    },
  };
});

vi.mock('./highlighter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./highlighter')>();
  return {
    ...actual,
    getHighlighter: () => (highlighter.impl ? highlighter.impl() : actual.getHighlighter()),
  };
});
vi.mock('hast-util-from-html', async (importOriginal) => {
  const actual = await importOriginal<typeof import('hast-util-from-html')>();
  return {
    ...actual,
    fromHtml: (...args: Parameters<typeof actual.fromHtml>) => {
      if (parsing.fail) throw new Error('parser exploded');
      return actual.fromHtml(...args);
    },
  };
});

import { getRenderedPostContent, renderPostContent } from './render';

function parse(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  highlighter.impl = null;
  parsing.fail = false;
  tables.fail = false;
  vi.restoreAllMocks();
});

describe('when highlighting is unavailable', () => {
  it('still frames every block with its copy button, uncoloured', async () => {
    highlighter.impl = () => Promise.reject(new Error('chunk failed to load'));

    const root = parse(
      (await renderPostContent('<pre><code class="language-js">const a = 1;</code></pre>')).html
    );

    expect(root.querySelector('.code-block [data-code-copy]')).not.toBeNull();
    expect(root.querySelector('.code-block > pre')?.classList.contains('shiki')).toBe(false);
    expect(root.querySelector('.code-block > pre')?.textContent).toBe('const a = 1;');
  });

  it('leaves a block the grammar fails on as written, and highlights the rest', async () => {
    const real = await (await import('./highlighter')).getHighlighter();
    highlighter.impl = async () => ({
      getLoadedLanguages: () => real.getLoadedLanguages(),
      codeToHast: (code: string, options: Parameters<typeof real.codeToHast>[1]) => {
        if (code.includes('boom')) throw new Error('grammar failed');
        return real.codeToHast(code, options);
      },
    });

    const root = parse(
      (
        await renderPostContent(
          '<pre><code class="language-js">boom()</code></pre><pre><code class="language-js">ok()</code></pre>'
        )
      ).html
    );
    const blocks = root.querySelectorAll('.code-block > pre');

    expect(blocks[0]!.classList.contains('shiki')).toBe(false);
    expect(blocks[0]!.textContent).toBe('boom()');
    expect(blocks[1]!.classList.contains('shiki')).toBe(true);
  });
});

describe('when rendering fails outright', () => {
  it('shows the post sanitized when a step after parsing fails', async () => {
    tables.fail = true;
    const post = {
      slug: 'half-rendered',
      content: '<p>Still readable.</p><script>steal()</script><img src="x" onerror="steal()">',
    };

    const fallback = await getRenderedPostContent(post);
    expect(fallback.html).toBe('<p>Still readable.</p><img src="x">');
  });

  it('shows the post as text when it cannot even be parsed, and tries again next time', async () => {
    parsing.fail = true;
    const post = { slug: 'unrenderable', content: '<p>Still readable.</p>' };

    const fallback = await getRenderedPostContent(post);
    // Escaped: the reader sees the words (and the tags), and nothing runs.
    expect(fallback.html).toBe('&#x3C;p>Still readable.&#x3C;/p>');
    expect(fallback.headings).toEqual([]);
    expect(fallback.faq).toEqual([]);

    parsing.fail = false;
    const next = await getRenderedPostContent(post);
    expect(next).not.toBe(fallback);
    expect(next.html).toBe('<p>Still readable.</p>');
  });
});
