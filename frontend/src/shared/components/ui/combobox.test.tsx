/**
 * The region picker.
 *
 * Two of these tests exist because of specific defects in the component this
 * replaces: it closed itself whenever the page scrolled, and it capped its own
 * height at six rows however long the list was. Filtering is the real fix for a
 * list this long, so most of what follows is about that.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Combobox, type ComboboxOption } from './combobox';

const REGIONS: ComboboxOption[] = [
  { value: 'us-east-1', label: 'US East (N. Virginia) - us-east-1' },
  { value: 'us-west-2', label: 'US West (Oregon) - us-west-2' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt) - eu-central-1' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai) - ap-south-1' },
];

function renderCombobox(props: Partial<React.ComponentProps<typeof Combobox>> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <Combobox
      options={REGIONS}
      value="us-east-1"
      onChange={onChange}
      label="Region"
      id="region"
      {...props}
    />
  );

  return { ...utils, onChange, input: screen.getByRole('combobox') };
}

describe('closed state', () => {
  it('shows the label of the selected option', () => {
    const { input } = renderCombobox();

    expect((input as HTMLInputElement).value).toBe('US East (N. Virginia) - us-east-1');
  });

  it('reports itself as a collapsed combobox', () => {
    const { input } = renderCombobox();

    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('filtering, which is the actual fix for a long list', () => {
  it('narrows by label', () => {
    const { input } = renderCombobox();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'frank' } });

    const options = within(screen.getByRole('listbox')).getAllByRole('option');

    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Frankfurt');
  });

  it('narrows by region code as well as place name', () => {
    const { input } = renderCombobox();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ap-south' } });

    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
  });

  it('says so when nothing matches', () => {
    const { input } = renderCombobox();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzzz' } });

    expect(screen.getByText(/no regions match/i)).toBeDefined();
  });
});

describe('selection', () => {
  it('commits a clicked option and closes', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'oregon' } });
    fireEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[0]);

    expect(onChange).toHaveBeenCalledWith('us-west-2');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('marks the current value as selected', () => {
    const { input } = renderCombobox();

    fireEvent.focus(input);
    const selected = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .filter((option) => option.getAttribute('aria-selected') === 'true');

    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain('N. Virginia');
  });
});

describe('keyboard', () => {
  it('opens on arrow down', () => {
    const { input } = renderCombobox();

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.getByRole('listbox')).toBeDefined();
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('moves through options and selects with enter', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('us-west-2');
  });

  it('wraps around the ends rather than dead-ending', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('ap-south-1');
  });

  it('closes on escape without selecting', () => {
    const { input, onChange } = renderCombobox();

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tracks the active option for assistive tech', () => {
    const { input } = renderCombobox();

    fireEvent.focus(input);

    expect(input.getAttribute('aria-activedescendant')).toBe('region-row-0');

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(input.getAttribute('aria-activedescendant')).toBe('region-row-1');
  });
});

describe('custom values, which MinIO needs', () => {
  it('offers what was typed when it matches nothing', () => {
    const { input } = renderCombobox({ allowCustomValue: true });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'my-own-region' } });

    expect(screen.getByText('my-own-region')).toBeDefined();
  });

  it('commits the typed value', () => {
    const { input, onChange } = renderCombobox({ allowCustomValue: true });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'my-own-region' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('my-own-region');
  });

  it('does not offer a custom row when custom values are off', () => {
    const { input } = renderCombobox({ allowCustomValue: false });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'my-own-region' } });

    expect(screen.queryByText('my-own-region')).toBeNull();
  });
});

// The previous component closed on any page scroll, so the natural reaction to
// a cramped list was the thing that dismissed it.
describe('the bug this replaces', () => {
  it('stays open when the page scrolls', () => {
    const { input } = renderCombobox();

    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeDefined();

    fireEvent.scroll(window);

    expect(screen.getByRole('listbox')).toBeDefined();
  });

  it('does not cap itself at a fixed number of rows', () => {
    const many: ComboboxOption[] = Array.from({ length: 30 }, (_, index) => ({
      value: `region-${index}`,
      label: `Region number ${index}`,
    }));

    const { input } = renderCombobox({ options: many, value: 'region-0' });
    fireEvent.focus(input);

    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(30);
  });
});

describe('disabled', () => {
  it('does not open', () => {
    const { input } = renderCombobox({ disabled: true });

    fireEvent.focus(input);

    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
