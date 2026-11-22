/**
 * Syntax highlighting for the code in blog posts, done on the server.
 *
 * Shiki turns code into coloured spans once, while the post is rendered, so the
 * browser gets plain HTML and no highlighter. Its core is used with only the
 * grammars posts are likely to need, and the JavaScript regex engine rather
 * than the WebAssembly one, which keeps a .wasm file out of the server bundle.
 *
 * Both themes are written into every span as CSS variables (`--shiki-light`,
 * `--shiki-dark`); globals.css picks one by the page's data-theme, so the
 * colours follow the theme toggle with no second render.
 */

import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

export const LIGHT_THEME = 'github-light-default';
export const DARK_THEME = 'github-dark-default';

let highlighter: Promise<HighlighterCore> | undefined;

/** One highlighter for the life of the server, created on first use. */
export function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [
      import('shiki/themes/github-light-default.mjs'),
      import('shiki/themes/github-dark-default.mjs'),
    ],
    // Each grammar brings its aliases along: shellscript answers to bash, sh,
    // shell and zsh; javascript to js, cjs and mjs; and so on.
    langs: [
      import('shiki/langs/shellscript.mjs'),
      import('shiki/langs/shellsession.mjs'),
      import('shiki/langs/powershell.mjs'),
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/jsx.mjs'),
      import('shiki/langs/tsx.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/yaml.mjs'),
      import('shiki/langs/toml.mjs'),
      import('shiki/langs/ini.mjs'),
      import('shiki/langs/xml.mjs'),
      import('shiki/langs/html.mjs'),
      import('shiki/langs/css.mjs'),
      import('shiki/langs/python.mjs'),
      import('shiki/langs/go.mjs'),
      import('shiki/langs/rust.mjs'),
      import('shiki/langs/sql.mjs'),
      import('shiki/langs/docker.mjs'),
      import('shiki/langs/http.mjs'),
      import('shiki/langs/diff.mjs'),
    ],
    engine: createJavaScriptRegexEngine(),
  }).catch((error: unknown) => {
    // Let the next post try again rather than every post failing from now on.
    highlighter = undefined;
    throw error;
  });

  return highlighter;
}
