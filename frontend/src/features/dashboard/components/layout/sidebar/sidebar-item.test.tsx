/**
 * The nav icon has to be the thing that is sized.
 *
 * The size classes used to sit on a wrapper `div` around the icon, and the icon
 * itself was given nothing. `react-icons` default to a width and height of
 * `1em`, so it inherited the row's `text-sm` and drew at 14px inside a slot
 * reserved for 20 - small, and sitting on the text baseline in the corner of
 * that box rather than centred, because an svg is inline-level.
 *
 * These pin the size onto the icon. The centring is structural: the row is
 * `flex items-center`, so a direct child is centred by the row itself and there
 * is no wrapper left to get it wrong.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarItem } from './sidebar-item';
import type { SidebarItem as SidebarItemType } from './types/sidebar';

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

// Stands in for a react-icons component, which spreads className onto its svg.
function TestIcon({ className }: { className?: string }) {
  return <svg data-testid="nav-icon" className={className} />;
}

const item: SidebarItemType = {
  title: 'My Drive',
  href: '/browse',
  icon: TestIcon,
};

function renderItem(over: Partial<Parameters<typeof SidebarItem>[0]> = {}) {
  return render(
    <SidebarItem
      item={item}
      basePath="/dashboard"
      isActive={() => false}
      onItemClick={() => {}}
      {...over}
    />
  );
}

describe('the sidebar icon carries its own size', () => {
  it('sizes the icon rather than a box around it', () => {
    renderItem();

    const icon = screen.getByTestId('nav-icon');

    expect(icon.getAttribute('class')).toContain('h-5');
    expect(icon.getAttribute('class')).toContain('w-5');
  });

  it('leaves no wrapper between the row and the icon', () => {
    // A wrapper is what let the icon sit uncentred: the row centres its own
    // children, and a block div in between does not pass that on.
    const { container } = renderItem();
    const icon = screen.getByTestId('nav-icon');

    expect(icon.parentElement).toBe(container.querySelector('a'));
  });

  it('uses the smaller size for a nested item', () => {
    renderItem({ isInDropdown: true });

    const icon = screen.getByTestId('nav-icon');

    expect(icon.getAttribute('class')).toContain('h-4');
    expect(icon.getAttribute('class')).toContain('w-4');
  });

  it('still recolours the icon on the active row', () => {
    // react-icons fill with currentColor, so this has to reach the svg.
    renderItem({ isActive: () => true });

    expect(screen.getByTestId('nav-icon').getAttribute('class')).toContain(
      'text-primary-foreground'
    );
  });
});
