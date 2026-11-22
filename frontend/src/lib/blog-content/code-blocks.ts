/**
 * Code blocks in a post: highlighted, framed, and given a copy button.
 *
 * WordPress sends code as bare `<pre><code class="language-x">`. Each block
 * becomes a frame with a header - the language on the left, a copy button on
 * the right - around the block itself, with its tokens coloured by Shiki when
 * the language is one it knows. The click on the button is handled in the
 * browser by PostContentListener, which listens for presses on any element
 * marked `data-code-copy`.
 */

import type { Element, ElementContent, Root } from 'hast';
import type { HighlighterCore } from 'shiki/core';
import { h, s } from 'hastscript';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import { classList } from './hast';
import { DARK_THEME, LIGHT_THEME } from './highlighter';

const LANGUAGE_CLASS = /^lang(?:uage)?-([\w+#.-]+)$/i;

/**
 * Names for the languages posts actually use. Anything else is shown as
 * written in its `language-*` class, and plain text gets no label at all: a
 * header saying "text" tells the reader nothing.
 */
const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  shellscript: 'Shell',
  zsh: 'Shell',
  console: 'Terminal',
  shellsession: 'Terminal',
  powershell: 'PowerShell',
  ps1: 'PowerShell',
  js: 'JavaScript',
  javascript: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  python: 'Python',
  py: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  sql: 'SQL',
  dockerfile: 'Dockerfile',
  docker: 'Dockerfile',
  ini: 'INI',
  toml: 'TOML',
  http: 'HTTP',
  diff: 'Diff',
};

const PLAIN_TEXT = new Set(['text', 'plain', 'plaintext', 'txt', 'none']);

/** Languages Shiki is not told about but that mean one it knows. */
const GRAMMAR_ALIASES: Record<string, string> = {
  console: 'shellsession',
  ps1: 'powershell',
  yml: 'yaml',
  py: 'python',
  dockerfile: 'docker',
};

function languageOf(node: Element | undefined): string | null {
  if (!node) return null;
  for (const name of classList(node)) {
    const match = name.match(LANGUAGE_CLASS);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

/** What the header shows for a language, or null to show nothing. */
export function getLanguageLabel(language: string | null): string | null {
  if (!language || PLAIN_TEXT.has(language)) return null;
  return LANGUAGE_LABELS[language] ?? language;
}

const ICON_PROPS = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  ariaHidden: 'true',
  focusable: 'false',
} as const;

// Lucide's "copy" and "check", drawn in hast: the frame is built on the
// server as HTML, where a React icon component cannot be used.
function copyIcon(): Element {
  return s('svg.code-block-icon.code-block-icon-copy', ICON_PROPS, [
    s('rect', { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }),
    s('path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }),
  ]);
}

function checkIcon(): Element {
  return s('svg.code-block-icon.code-block-icon-check', ICON_PROPS, [
    s('path', { d: 'M20 6 9 17l-5-5' }),
  ]);
}

function header(label: string | null): Element {
  return h('div.code-block-header', [
    ...(label ? [h('span.code-block-lang', label)] : []),
    // The status sits beside the button rather than inside it: the button's
    // name is its aria-label, and a live region tucked inside a labelled
    // control is not announced reliably by every screen reader.
    h('span.code-block-copy-status', { ariaLive: 'polite' }),
    h(
      'button.code-block-copy',
      { type: 'button', dataCodeCopy: '', ariaLabel: 'Copy code', title: 'Copy code' },
      [copyIcon(), checkIcon()]
    ),
  ]);
}

/**
 * The block with its tokens coloured, or null when Shiki has no grammar for
 * the language (or there is no language), in which case the block stays as
 * WordPress wrote it.
 */
function highlight(
  code: string,
  language: string | null,
  highlighter: HighlighterCore | null
): Element | null {
  if (!highlighter || !language || PLAIN_TEXT.has(language)) return null;

  const grammar = GRAMMAR_ALIASES[language] ?? language;
  if (!highlighter.getLoadedLanguages().includes(grammar)) return null;

  try {
    const root = highlighter.codeToHast(code, {
      lang: grammar,
      themes: { light: LIGHT_THEME, dark: DARK_THEME },
      // Variables only, no colour of its own: CSS picks the theme's variable,
      // so the colours follow the page's theme toggle.
      defaultColor: false,
    });
    const pre = root.children.find(
      (child): child is Element => child.type === 'element' && child.tagName === 'pre'
    );
    return pre ?? null;
  } catch (error) {
    // One block the grammar cannot handle stays as written; the rest of the
    // post is still highlighted.
    console.error(`Could not highlight a ${language} block`, error);
    return null;
  }
}

/**
 * Frames, and where possible highlights, every `<pre>` in the tree. Runs in
 * place. With no highlighter (it failed to load), blocks are framed, with
 * their copy buttons, and left uncoloured.
 */
export function transformCodeBlocks(tree: Root, highlighter: HighlighterCore | null): void {
  const blocks: Array<{ node: Element; index: number; parent: Root | Element }> = [];

  visit(tree, 'element', (node, index, parent) => {
    if (node.tagName !== 'pre' || index === undefined || !parent) return;
    blocks.push({ node, index, parent: parent as Root | Element });
    // A <pre> cannot hold another; nothing inside it needs visiting.
    return 'skip';
  });

  for (const { node: pre, index, parent } of blocks) {
    const code = pre.children.find(
      (child): child is Element => child.type === 'element' && child.tagName === 'code'
    );
    const language = languageOf(code) ?? languageOf(pre);
    // WordPress ends most blocks with a newline, which Shiki would draw as an
    // empty last line.
    const text = toString(code ?? pre).replace(/\n$/, '');

    const highlighted = highlight(text, language, highlighter);
    const block: Element = highlighted ?? pre;

    block.properties = {
      ...(highlighted ? { className: ['shiki'] } : pre.properties),
      ...(language ? { dataLanguage: language } : {}),
      // Lets a keyboard reach the block to scroll it sideways: long lines
      // scroll rather than wrap.
      tabIndex: 0,
    };

    const frame = h('div.code-block', [header(getLanguageLabel(language)), block]);
    parent.children[index] = frame as ElementContent;
  }
}
