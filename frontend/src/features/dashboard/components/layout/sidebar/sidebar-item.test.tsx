/**
 * The nav icon has to be the thing that is sized.
 *
 * The size classes used to sit on a wrapper `div` and the icon inside was given
 * nothing. `react-icons` default to a width and height of `1em`, so it
 * inherited the row's `text-sm` and drew at 14px. The wrapper reserved 20, and
 * Tailwind's preflight makes an svg `display: block`, so those 14px sat in the
 * top left corner of that box: the row centred the box, and nothing centred the
 * icon inside it. Small and high, from one cause.
 *
 * These pin the size onto the icon itself, and pin the absence of a sized box
 * around it, which is the half that made it look off-centre. Both rows are
 * covered because they carry the same markup and drifting apart is how this
 * comes back.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarItem } from './sidebar-item';
import { SidebarDropdown } from './sidebar-dropdown';
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

  it('leaves no sized box around the icon', () => {
    // Asserting on the box rather than on parentage: an unrelated wrapper added
    // later is harmless, a wrapper carrying the size is the actual regression.
    const { container } = renderItem();

    const sizedBoxes = Array.from(container.querySelectorAll('div')).filter((el) =>
      el.className.split(' ').some((c) => c === 'h-4' || c === 'h-5')
    );

    expect(sizedBoxes).toHaveLength(0);
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

describe('the dropdown row sizes its icon the same way', () => {
  it('sizes the icon rather than a box around it', () => {
    const { container } = render(
      <SidebarDropdown
        item={{ ...item, children: [] }}
        isOpen={false}
        onToggle={() => {}}
        basePath="/dashboard"
        isActive={() => false}
        onItemClick={() => {}}
      />
    );

    const icon = screen.getByTestId('nav-icon');

    expect(icon.getAttribute('class')).toContain('h-5');
    expect(
      Array.from(container.querySelectorAll('div')).filter((el) =>
        el.className.split(' ').includes('h-5')
      )
    ).toHaveLength(0);
  });
});
