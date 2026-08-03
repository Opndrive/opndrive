/**
 * Breadcrumb.
 *
 * The two things worth pinning down are the ones that keep the trail from
 * growing: a name longer than the budget is cut but still readable on hover,
 * and a deep trail hides its middle behind a menu that can still reach every
 * folder it hid. A trail that collapses but strands the hidden folders is the
 * bug this component replaced, so the menu navigation is asserted, not assumed.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Breadcrumb, truncateName, type BreadcrumbItem } from './breadcrumb';

function trail(names: string[], onSelect: (name: string) => void = () => {}): BreadcrumbItem[] {
  return names.map((name) => ({ name, onSelect: () => onSelect(name) }));
}

const crumbNames = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.textContent?.trim())
    .filter((text) => text !== '');

describe('truncateName', () => {
  it('leaves a name that fits alone', () => {
    expect(truncateName('Reports', 20)).toBe('Reports');
  });

  it('keeps the cut name inside the budget, ellipsis included', () => {
    const cut = truncateName('hello there am here how are', 20);

    expect(cut).toBe('hello there am here…');
    expect(cut.length).toBe(20);
  });

  it('does not leave a space stranded in front of the ellipsis', () => {
    expect(truncateName('Design Assets 2026 archive', 20)).toBe('Design Assets 2026…');
  });
});

describe('long names', () => {
  it('truncates the label and puts the full name in the tooltip', () => {
    render(<Breadcrumb items={trail(['My Drive', 'hello there am here how are'])} />);

    const crumb = screen.getByTitle('hello there am here how are');

    expect(crumb.textContent).toBe('hello there am here…');
  });

  it('gives a name that already fits no tooltip', () => {
    render(<Breadcrumb items={trail(['My Drive', 'Reports'])} />);

    expect(screen.getByRole('button', { name: 'Reports' }).getAttribute('title')).toBeNull();
  });

  it('honours a custom character budget', () => {
    render(<Breadcrumb items={trail(['My Drive', 'Quarterly Reports'])} maxLabelLength={10} />);

    expect(screen.getByTitle('Quarterly Reports').textContent).toBe('Quarterly…');
  });
});

describe('short trails', () => {
  it('shows every crumb and no overflow menu', () => {
    render(<Breadcrumb items={trail(['My Drive', 'a', 'b', 'c', 'd'])} />);

    expect(crumbNames()).toEqual(['My Drive', 'a', 'b', 'c', 'd']);
    expect(screen.queryByRole('button', { name: /hidden folders/ })).toBeNull();
  });

  it('marks the last crumb as the current location', () => {
    render(<Breadcrumb items={trail(['My Drive', 'a', 'b'])} />);

    expect(screen.getByRole('button', { name: 'b' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'a' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('icons', () => {
  it('draws the icon but keeps it out of the accessible name', () => {
    render(
      <Breadcrumb
        items={[
          { name: 'Home', icon: <svg data-testid="home-icon" />, onSelect: () => {} },
          { name: 'Reports', onSelect: () => {} },
        ]}
      />
    );

    expect(screen.getByTestId('home-icon')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Home' })).not.toBeNull();
  });
});

describe('deep trails', () => {
  const deep = ['My Drive', 'one', 'two', 'three', 'four', 'five', 'six'];

  it('keeps the root and the last two crumbs, and hides the rest', () => {
    render(<Breadcrumb items={trail(deep)} />);

    expect(crumbNames()).toEqual(['My Drive', 'five', 'six']);
    expect(screen.queryByText('three')).toBeNull();
  });

  it('lists the hidden folders in path order when the ellipsis is clicked', () => {
    render(<Breadcrumb items={trail(deep)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show 4 hidden folders' }));

    const options = within(screen.getByRole('menu')).getAllByRole('menuitem');

    expect(options.map((option) => option.textContent)).toEqual(['one', 'two', 'three', 'four']);
  });

  it('navigates to a hidden folder and closes the menu', () => {
    const onSelect = vi.fn();
    render(<Breadcrumb items={trail(deep, onSelect)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show 4 hidden folders' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'two' }));

    expect(onSelect).toHaveBeenCalledWith('two');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on a click outside and on Escape', () => {
    render(<Breadcrumb items={trail(deep)} />);
    const trigger = screen.getByRole('button', { name: 'Show 4 hidden folders' });

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not collapse when the menu would hide a single crumb', () => {
    // Four crumbs is over this threshold, but head + tail already keep three of
    // them, so a menu would trade one chip for another.
    render(<Breadcrumb items={trail(['My Drive', 'one', 'two', 'three'])} maxVisibleItems={3} />);

    expect(screen.queryByRole('button', { name: /hidden folders/ })).toBeNull();
    expect(crumbNames()).toEqual(['My Drive', 'one', 'two', 'three']);
  });

  it('respects custom head and tail counts', () => {
    render(<Breadcrumb items={trail(deep)} itemsBeforeCollapse={2} itemsAfterCollapse={1} />);

    expect(crumbNames()).toEqual(['My Drive', 'one', 'six']);
    expect(screen.getByRole('button', { name: 'Show 4 hidden folders' })).not.toBeNull();
  });
});
