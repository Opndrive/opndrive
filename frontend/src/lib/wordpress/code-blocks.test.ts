/**
 * The copy buttons on a post's code blocks are added to WordPress's HTML as a
 * string transform. These tests pin what that transform must and must not
 * touch: every block gets a frame, the code itself comes through byte for
 * byte, and the language label never carries markup from the post.
 */

import { describe, it, expect } from 'vitest';
import { addCodeBlockToolbars, getCodeLanguage, getLanguageLabel } from './code-blocks';

function parse(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('addCodeBlockToolbars', () => {
  it('frames a block with a copy button and keeps the code unchanged', () => {
    const block = '<pre><code class="language-bash">curl -X PUT &quot;$URL&quot;\n</code></pre>';
    const output = addCodeBlockToolbars(block);
    const root = parse(output);

    const frame = root.querySelector('.code-block');
    expect(frame).not.toBeNull();
    expect(frame?.querySelector('button[data-code-copy]')?.getAttribute('aria-label')).toBe(
      'Copy code'
    );
    expect(frame?.querySelector('.code-block-lang')?.textContent).toBe('Bash');
    // The original block is carried over verbatim, entities and all. Checked on
    // the string itself: a DOM round trip would re-serialise &quot; as ".
    expect(output.endsWith(`${block}</div>`)).toBe(true);
  });

  it('frames every block and leaves the HTML between them alone', () => {
    const html =
      '<p>First:</p><pre><code>one</code></pre><p>Then <code>inline</code>:</p>' +
      '<pre class="wp-block-code"><code>two</code></pre>';
    const root = parse(addCodeBlockToolbars(html));

    expect(root.querySelectorAll('.code-block')).toHaveLength(2);
    expect(root.querySelectorAll('.code-block > pre')).toHaveLength(2);
    // Inline code is not a block and gets no button.
    expect(root.querySelectorAll('p > code')).toHaveLength(1);
    expect(root.querySelectorAll('[data-code-copy]')).toHaveLength(2);
  });

  it('shows no label for plain text or an unmarked block', () => {
    const root = parse(
      addCodeBlockToolbars(
        '<pre><code class="language-text">a</code></pre><pre><code>b</code></pre>'
      )
    );

    expect(root.querySelectorAll('.code-block')).toHaveLength(2);
    expect(root.querySelector('.code-block-lang')).toBeNull();
  });

  it('returns HTML with no code blocks unchanged', () => {
    const html = '<p>Nothing to copy here, only <code>inline</code> code.</p>';
    expect(addCodeBlockToolbars(html)).toBe(html);
  });
});

describe('getCodeLanguage', () => {
  it('reads the class from the <code> element or from <pre>', () => {
    expect(getCodeLanguage('', '<code class="language-js">x</code>')).toBe('js');
    expect(getCodeLanguage(' class="wp-block-code lang-TS"', '<code>x</code>')).toBe('ts');
  });

  it('only looks at the opening <code> tag, not at text inside the block', () => {
    expect(getCodeLanguage('', 'see class="language-js" in the docs')).toBeNull();
  });

  it('cannot be used to inject markup through the label', () => {
    const root = parse(
      addCodeBlockToolbars('<pre><code class="language-x<img src=y onerror=z>">a</code></pre>')
    );
    expect(root.querySelector('.code-block-header img')).toBeNull();
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
