/**
 * A dropdown has to have a background.
 *
 * `DropdownMenuContent` paints itself with `bg-popover`, and nothing in
 * `globals.css` defined `--popover`. Tailwind emits no rule for a colour it has
 * never heard of and CSS says nothing about it either, so every menu in the app
 * rendered as text floating over whatever was behind it. The one menu that
 * looked fine - the profile menu - only escaped by passing `bg-secondary` of
 * its own.
 *
 * Neither half of that is visible to a component test: the class was applied,
 * the element was in the document, and jsdom does not resolve custom
 * properties. So this checks the contract itself, in both directions - the
 * primitive asks for the token, and the stylesheet defines it in every theme.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const COMPONENT = readFileSync(
  join(process.cwd(), 'src/shared/components/ui/dropdown-menu.tsx'),
  'utf8'
);
const STYLES = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** The names a floating panel is painted with. */
const PANEL_TOKENS = ['--popover', '--popover-foreground'] as const;

/** How an explicitly chosen dark theme is selected, as regex source. */
const DARK_SELECTOR = String.raw`\[data-theme='dark'\]`;

/** Text inside `selector { ... }`, brace-aware so nested blocks do not truncate it. */
function block(css: string, selector: string): string {
  const opening = new RegExp(`${selector}\\s*\\{`).exec(css);
  if (!opening) return '';

  let depth = 1;
  let index = opening.index + opening[0].length;
  const start = index;

  while (depth > 0 && index < css.length) {
    if (css[index] === '{') depth++;
    else if (css[index] === '}') depth--;
    index++;
  }

  return css.slice(start, index - 1);
}

describe('the dropdown panel is painted', () => {
  it('asks for the popover colour', () => {
    // If this ever stops being true the test below is measuring nothing, so it
    // is asserted rather than assumed.
    expect(COMPONENT).toContain('bg-popover');
    expect(COMPONENT).toContain('text-popover-foreground');
  });

  it.each(PANEL_TOKENS)('defines %s for the light theme', (token) => {
    expect(block(STYLES, ':root')).toContain(`${token}:`);
  });

  it.each(PANEL_TOKENS)('defines %s for the dark theme', (token) => {
    // Both ways this app can be dark: the explicit choice and the system
    // preference. Defining it in only one leaves half the users with a
    // transparent menu, which is exactly as broken as none of them having it.
    expect(block(STYLES, DARK_SELECTOR)).toContain(`${token}:`);
    expect(STYLES.split('prefers-color-scheme: dark')[1] ?? '').toContain(`${token}:`);
  });

  it.each(PANEL_TOKENS)('exposes %s to Tailwind', (token) => {
    // Defining the custom property is not enough on its own: without the
    // `--color-*` mapping there is no `bg-popover` utility to apply.
    expect(block(STYLES, '@theme inline')).toContain(`--color${token.slice(1)}: var(${token})`);
  });
});
