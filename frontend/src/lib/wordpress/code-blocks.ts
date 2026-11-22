/**
 * Code blocks in a post arrive from WordPress as bare `<pre><code>` HTML, with
 * nothing a reader can press to copy them. This wraps each one in a frame with
 * a header: the language on the left, a copy button on the right.
 *
 * It runs on the server, as a string transform, so the buttons are in the
 * HTML the page is sent with rather than appearing a beat after it loads. The
 * click itself is handled by `BlogPostContent`, which listens for presses on
 * any element marked `data-code-copy`.
 */

// `<pre>` cannot contain another `<pre>`, so the lazy match always ends at the
// close of the block it opened.
const PRE_BLOCK = /<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi;
const FIRST_CODE_TAG = /^\s*<code\b([^>]*)>/i;
const LANGUAGE_CLASS = /class\s*=\s*["'][^"']*\blang(?:uage)?-([\w+#.-]+)/i;

/**
 * Names for the languages posts actually use. Anything else is shown as
 * written in its `language-*` class, and plain text gets no label at all: a
 * header saying "text" tells the reader nothing.
 */
const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  zsh: 'Shell',
  console: 'Terminal',
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
  ini: 'INI',
  toml: 'TOML',
  http: 'HTTP',
  diff: 'Diff',
};

const PLAIN_TEXT = new Set(['text', 'plain', 'plaintext', 'txt', 'none']);

// Lucide's "copy" and "check", inlined: this markup is built as a string, so a
// React icon component cannot be used here.
const SVG_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const COPY_ICON = `<svg class="code-block-icon code-block-icon-copy" ${SVG_ATTRS}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg class="code-block-icon code-block-icon-check" ${SVG_ATTRS}><path d="M20 6 9 17l-5-5"/></svg>`;

// The status sits beside the button rather than inside it: the button's name
// is its aria-label, and a live region tucked inside a labelled control is not
// announced reliably by every screen reader.
const COPY_CONTROLS =
  '<span class="code-block-copy-status" aria-live="polite"></span>' +
  '<button type="button" class="code-block-copy" data-code-copy aria-label="Copy code" title="Copy code">' +
  COPY_ICON +
  CHECK_ICON +
  '</button>';

/** The language a block is marked as, taken from `<pre>` or its `<code>`. */
export function getCodeLanguage(preAttributes: string, preContent: string): string | null {
  const codeAttributes = preContent.match(FIRST_CODE_TAG)?.[1] ?? '';
  const match = preAttributes.match(LANGUAGE_CLASS) ?? codeAttributes.match(LANGUAGE_CLASS);
  return match ? match[1].toLowerCase() : null;
}

/** What the header shows for a language, or null to show nothing. */
export function getLanguageLabel(language: string | null): string | null {
  if (!language || PLAIN_TEXT.has(language)) return null;
  return LANGUAGE_LABELS[language] ?? language;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wrap every `<pre>` block in `html` in a frame with a copy button. */
export function addCodeBlockToolbars(html: string): string {
  return html.replace(PRE_BLOCK, (block, preAttributes: string, preContent: string) => {
    const label = getLanguageLabel(getCodeLanguage(preAttributes, preContent));
    const labelHtml = label ? `<span class="code-block-lang">${escapeHtml(label)}</span>` : '';

    return (
      '<div class="code-block">' +
      `<div class="code-block-header">${labelHtml}${COPY_CONTROLS}</div>` +
      block +
      '</div>'
    );
  });
}
