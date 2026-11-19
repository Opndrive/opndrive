/**
 * The layout toggle is two icon buttons. Its tooltip describes a button only
 * while it shows, so each needs a name of its own, and says which is on.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayoutToggle } from './layout-toggle';

vi.mock('@/hooks/use-layout-preference', () => ({
  useLayoutPreference: () => ({ layout: 'list', setLayout: vi.fn(), isLoaded: true }),
}));

describe('the layout toggle', () => {
  it('names both buttons and marks the one in use', () => {
    render(<LayoutToggle />);

    expect(screen.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByRole('button', { name: 'Grid view' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
  });
});
