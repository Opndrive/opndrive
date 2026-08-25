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
 *
 * The rest cover what the two rows do beyond their icons: the badge, the
 * disabled state, and the attributes that make a disclosure and a current page
 * legible to a screen reader.
 *
 * Assertions here are plain DOM reads on purpose - jest-dom is not installed,
 * so there is no `toHaveAttribute` to reach for.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarItem } from './sidebar-item';
import { SidebarDropdown } from './sidebar-dropdown';
import type { SidebarItem as SidebarItemType } from './types/sidebar';

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

// Stands in for a react-icons component, which spreads its props onto its svg.
function TestIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return <svg data-testid="nav-icon" className={className} {...props} />;
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

function renderDropdown(over: Partial<Parameters<typeof SidebarDropdown>[0]> = {}) {
  return render(
    <SidebarDropdown
      item={{ ...item, children: [] }}
      isOpen={false}
      onToggle={() => {}}
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

  it('hides the icon from assistive technology', () => {
    // The label beside it already names the row; the icon would only repeat it.
    renderItem();

    expect(screen.getByTestId('nav-icon').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the dropdown row sizes its icon the same way', () => {
  it('sizes the icon rather than a box around it', () => {
    const { container } = renderDropdown();

    const icon = screen.getByTestId('nav-icon');

    // Both dimensions: a regression that set only the height would otherwise
    // walk past a height-only assertion.
    expect(icon.getAttribute('class')).toContain('h-5');
    expect(icon.getAttribute('class')).toContain('w-5');
    expect(
      Array.from(container.querySelectorAll('div')).filter((el) =>
        el.className.split(' ').includes('h-5')
      )
    ).toHaveLength(0);
  });

  it('hides its icon from assistive technology', () => {
    renderDropdown();

    expect(screen.getByTestId('nav-icon').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the current row says so', () => {
  it('marks the active row as the current page', () => {
    renderItem({ isActive: () => true });

    expect(screen.getByRole('link').getAttribute('aria-current')).toBe('page');
  });

  it('leaves aria-current off every other row', () => {
    renderItem();

    expect(screen.getByRole('link').getAttribute('aria-current')).toBeNull();
  });
});

describe('the dropdown announces itself as a disclosure', () => {
  it('reports collapsed and expanded state', () => {
    renderDropdown();

    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');

    screen.getByRole('button');
    renderDropdown({ isOpen: true });

    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1].getAttribute('aria-expanded')).toBe('true');
  });

  it('points aria-controls at a panel that exists while collapsed', () => {
    // The panel is hidden rather than unmounted precisely so this id resolves
    // in both states; an aria-controls pointing at nothing is not a disclosure.
    const { container } = renderDropdown();

    const panelId = screen.getByRole('button').getAttribute('aria-controls');

    expect(panelId).toBeTruthy();

    const panel = Array.from(container.querySelectorAll('div')).find((el) => el.id === panelId);

    expect(panel).toBeDefined();
    expect(panel?.hasAttribute('hidden')).toBe(true);
  });

  it('reveals that same panel when open', () => {
    const { container } = renderDropdown({ isOpen: true });

    const panelId = screen.getByRole('button').getAttribute('aria-controls');
    const panel = Array.from(container.querySelectorAll('div')).find((el) => el.id === panelId);

    expect(panel?.hasAttribute('hidden')).toBe(false);
  });
});

describe('the badge', () => {
  it('renders a zero count as a badge rather than a stray character', () => {
    // `{item.badge && ...}` rendered a bare `0` beside the label for a zero
    // count, because 0 is falsy but still a valid React child.
    renderItem({ item: { ...item, badge: 0 } });

    const badge = screen.getByText('0');

    expect(badge.tagName).toBe('SPAN');
    expect(badge.getAttribute('class')).toContain('rounded-full');
  });

  it('is absent when no badge is set', () => {
    const { container } = renderItem();

    expect(container.querySelectorAll('.rounded-full')).toHaveLength(0);
  });

  it('sits at the end of the row in both rows', () => {
    // The dropdown used to push its badge up against the title while the plain
    // row pushed it to the end. One badge, one position.
    const { container: plain } = renderItem({ item: { ...item, badge: 3 } });
    const { container: dropdown } = renderDropdown({ item: { ...item, badge: 3, children: [] } });

    for (const root of [plain, dropdown]) {
      const badge = Array.from(root.querySelectorAll('span')).find((el) => el.textContent === '3');

      expect(badge?.getAttribute('class')).toContain('ml-auto');
    }
  });
});

describe('a disabled row cannot be navigated to', () => {
  it('renders no link', () => {
    const { container } = renderItem({ item: { ...item, disabled: true } });

    expect(container.querySelector('a')).toBeNull();
  });

  it('announces itself as disabled', () => {
    const { container } = renderItem({ item: { ...item, disabled: true } });

    expect(container.firstElementChild?.getAttribute('aria-disabled')).toBe('true');
  });

  it('is never the current page, whatever the route says', () => {
    const { container } = renderItem({
      item: { ...item, disabled: true },
      isActive: () => true,
    });

    expect(container.firstElementChild?.getAttribute('aria-current')).toBeNull();
    expect(container.firstElementChild?.className).toContain('opacity-50');
  });
});
