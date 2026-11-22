/**
 * The post body pipeline: code blocks framed with a copy button and, where
 * Shiki knows the language, highlighted - without changing the code itself or
 * anything else in the post.
 */
import { describe, expect, it } from 'vitest';
import { renderPostContent, getRenderedPostContent, fingerprint } from './render';
import { getLanguageLabel } from './code-blocks';

function parse(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

async function render(html: string): Promise<HTMLElement> {
  return parse((await renderPostContent(html)).html);
}

describe('code blocks', () => {
  it('frames a block with a header, a language label and a copy button', async () => {
    const root = await render('<pre><code class="language-bash">aws s3 ls\n</code></pre>');

    const frame = root.querySelector('.code-block');
    expect(frame?.querySelector('.code-block-lang')?.textContent).toBe('Bash');
    const button = frame?.querySelector('button[data-code-copy]');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('aria-label')).toBe('Copy code');
    expect(frame?.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('colours the tokens of a language Shiki knows, for both themes', async () => {
    const root = await render('<pre><code class="language-js">const a = 1;</code></pre>');

    const pre = root.querySelector('.code-block > pre');
    expect(pre?.classList.contains('shiki')).toBe(true);
    expect(pre?.getAttribute('data-language')).toBe('js');
    const token = pre?.querySelector('span[style*="--shiki-light"]');
    expect(token?.getAttribute('style')).toMatch(/--shiki-dark:/);
    // No colour of the theme's own on the block: the page's theme decides.
    expect(pre?.getAttribute('style')).toBeNull();
  });

  it('keeps the code itself exactly, entities decoded, with no extra last line', async () => {
    const source =
      'const url = &quot;https://x/&lt;KEY&gt;?a=1&amp;b=2&quot;;\nif (a &lt; b) {\n  go();\n}\n';
    const root = await render(`<pre><code class="language-js">${source}</code></pre>`);

    expect(root.querySelector('.code-block > pre')?.textContent).toBe(
      'const url = "https://x/<KEY>?a=1&b=2";\nif (a < b) {\n  go();\n}'
    );
  });

  it('frames a block in a language Shiki does not know, leaving it as written', async () => {
    const root = await render('<pre><code class="language-elixir">IO.puts 1</code></pre>');

    const pre = root.querySelector('.code-block > pre');
    expect(pre?.classList.contains('shiki')).toBe(false);
    expect(pre?.textContent).toBe('IO.puts 1');
    expect(root.querySelector('.code-block-lang')?.textContent).toBe('elixir');
  });

  it('frames plain text and unmarked blocks with no label', async () => {
    const root = await render(
      '<pre><code class="language-text">a</code></pre><pre class="wp-block-code"><code>b</code></pre>'
    );

    expect(root.querySelectorAll('.code-block')).toHaveLength(2);
    expect(root.querySelector('.code-block-lang')).toBeNull();
  });

  it('reads the language from <pre> too, and resolves aliases Shiki is not told', async () => {
    const root = await render('<pre class="lang-yml"><code>a: 1</code></pre>');

    expect(root.querySelector('.code-block-lang')?.textContent).toBe('YAML');
    expect(root.querySelector('.code-block > pre')?.classList.contains('shiki')).toBe(true);
  });

  it('lets a keyboard reach each block, so long lines can be scrolled to', async () => {
    const root = await render('<pre><code>x</code></pre>');
    expect(root.querySelector('.code-block > pre')?.getAttribute('tabindex')).toBe('0');
  });

  it('leaves inline code and everything around the blocks alone', async () => {
    const root = await render(
      '<p>Run <code>ls</code> first:</p><pre><code class="language-bash">ls</code></pre><p>Then this.</p>'
    );

    expect(root.querySelectorAll('[data-code-copy]')).toHaveLength(1);
    expect(root.querySelector('p > code')?.textContent).toBe('ls');
    expect(root.firstElementChild?.outerHTML).toBe('<p>Run <code>ls</code> first:</p>');
    expect(root.lastElementChild?.outerHTML).toBe('<p>Then this.</p>');
  });

  it('returns prose with no code blocks unchanged in meaning', async () => {
    // Headings are left out: they gain a link to themselves (headings.test.ts).
    const html = '<p>Text &amp; more, “quoted”.</p><ul><li>One</li><li>Two</li></ul>';
    const root = await render(html);
    expect(root.innerHTML).toBe(parse(html).innerHTML);
  });
});

describe('getLanguageLabel', () => {
  it('names common languages and passes unknown ones through', () => {
    expect(getLanguageLabel('js')).toBe('JavaScript');
    expect(getLanguageLabel('yml')).toBe('YAML');
    expect(getLanguageLabel('elixir')).toBe('elixir');
    expect(getLanguageLabel('plaintext')).toBeNull();
    expect(getLanguageLabel(null)).toBeNull();
  });
});

describe('getRenderedPostContent', () => {
  it('renders a post version once and hands back the same result after', async () => {
    const post = { slug: 'memo-test', modifiedDate: '2026-11-02T04:30:00Z', content: '<p>a</p>' };

    const first = getRenderedPostContent(post);
    expect(getRenderedPostContent(post)).toBe(first);
    expect((await first).html).toBe('<p>a</p>');
  });

  it('renders again when the HTML changes, even with the same modified date', async () => {
    // A synced pattern or a re-captioned image changes the HTML WordPress
    // sends without moving the post's modified date.
    const before = { slug: 'memo-edit', modifiedDate: '2026-11-02T04:30:00Z', content: '<p>a</p>' };
    const after = { ...before, content: '<p>b</p>' };

    await getRenderedPostContent(before);
    expect((await getRenderedPostContent(after)).html).toBe('<p>b</p>');
  });

  it('fingerprints different HTML differently, and the same HTML the same', () => {
    expect(fingerprint('<p>a</p>')).toBe(fingerprint('<p>a</p>'));
    expect(fingerprint('<p>a</p>')).not.toBe(fingerprint('<p>b</p>'));
    expect(fingerprint('ab')).not.toBe(fingerprint('ba'));
  });
});
