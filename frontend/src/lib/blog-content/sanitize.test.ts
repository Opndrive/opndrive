import { describe, expect, it } from 'vitest';
import { sanitizePostHtml } from './sanitize';
import { renderPostContent } from './render';

describe('what a post may not carry onto the page', () => {
  it.each([
    ['a script', '<p>a</p><script>steal()</script>', '<p>a</p>'],
    [
      'an event handler',
      '<img src="https://x.test/a.png" onerror="steal()">',
      '<img src="https://x.test/a.png">',
    ],
    ['a javascript: link', '<a href="javascript:steal()">x</a>', '<a>x</a>'],
    ['a data: link', '<a href="data:text/html,hi">x</a>', '<a>x</a>'],
    [
      'an iframe, with its fallback',
      '<iframe src="https://x.test">fallback</iframe><p>a</p>',
      '<p>a</p>',
    ],
    ['a style element', '<style>body{display:none}</style><p>a</p>', '<p>a</p>'],
    ['a style attribute', '<p style="position:fixed;inset:0">a</p>', '<p>a</p>'],
    ['a form', '<form action="https://x.test"><input name="key"><button>Go</button></form>', 'Go'],
    ['an object', '<object data="x.swf">alt</object>', ''],
    [
      'a meta refresh',
      '<meta http-equiv="refresh" content="0;url=https://x.test"><p>a</p>',
      '<p>a</p>',
    ],
    ['a base tag', '<base href="https://x.test/"><p>a</p>', '<p>a</p>'],
    ['an svg', '<svg><script>steal()</script></svg><p>a</p>', '<p>a</p>'],
  ])('removes %s', (_, html, expected) => {
    expect(sanitizePostHtml(html)).toBe(expected);
  });

  it('prefixes name, so a post cannot clobber globals by name', () => {
    expect(sanitizePostHtml('<a name="next">x</a>')).toBe('<a name="user-content-next">x</a>');
  });
});

describe('what an article keeps', () => {
  it('keeps headings with their ids, so section links still work', () => {
    expect(sanitizePostHtml('<h2 id="install" class="wp-block-heading">Install</h2>')).toBe(
      '<h2 id="install" class="wp-block-heading">Install</h2>'
    );
  });

  it('keeps figures, captions and responsive pictures', () => {
    const html =
      '<figure class="wp-block-image size-large"><img src="https://x.test/a.png" alt="A" width="800" height="600" srcset="https://x.test/a-300.png 300w, https://x.test/a.png 800w" sizes="(max-width: 800px) 100vw, 800px" loading="lazy" decoding="async"><figcaption>Caption</figcaption></figure>';
    expect(sanitizePostHtml(html)).toBe(html);
  });

  it('keeps code with its language class', () => {
    const html = '<pre class="wp-block-code"><code class="language-bash">ls</code></pre>';
    expect(sanitizePostHtml(html)).toBe(html);
  });

  it('keeps links, and how they open', () => {
    const html =
      '<a href="https://opndrive.app/connect" target="_blank" rel="noopener">x</a><a href="#install">y</a><a href="mailto:a@b.test">z</a>';
    expect(sanitizePostHtml(html)).toBe(html);
  });

  it('keeps tables', () => {
    const html =
      '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
    expect(sanitizePostHtml(html)).toBe(html);
  });
});

describe('the rendered post', () => {
  it('is sanitized before anything else reads it', async () => {
    const { html } = await renderPostContent(
      '<h2>Setup</h2><p onclick="steal()">Text</p><iframe src="https://x.test"></iframe>'
    );

    expect(html).not.toMatch(/onclick|iframe|steal/);
    expect(html).toContain('Setup');
    expect(html).toContain('Text');
  });
});
