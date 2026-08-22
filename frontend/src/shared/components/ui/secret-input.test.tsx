/**
 * The reveal toggle's accessibility contract.
 *
 * The details tested here are the ones that are easy to get wrong and
 * invisible when they are: a name that changes as you press it, a control with
 * no name at all, and focus jumping out of the field you were typing in.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SecretInput } from './secret-input';

function renderInput(value = 'super-secret') {
  const onChange = vi.fn();
  const utils = render(
    <SecretInput value={value} onChange={onChange} label="secret access key" id="secret" />
  );

  return {
    ...utils,
    onChange,
    input: document.getElementById('secret') as HTMLInputElement,
    toggle: screen.getByRole('button'),
  };
}

describe('masking', () => {
  it('starts hidden, because revealing is the user’s decision', () => {
    const { input } = renderInput();

    expect(input.type).toBe('password');
  });

  it('reveals and re-hides on click', () => {
    const { input, toggle } = renderInput();

    fireEvent.click(toggle);
    expect(input.type).toBe('text');

    fireEvent.click(toggle);
    expect(input.type).toBe('password');
  });

  it('passes edits up', () => {
    const { input, onChange } = renderInput('');

    fireEvent.change(input, { target: { value: 'abc' } });

    expect(onChange).toHaveBeenCalledWith('abc');
  });
});

describe('the toggle button', () => {
  it('has an accessible name, not just an icon', () => {
    const { toggle } = renderInput();

    expect(toggle.getAttribute('aria-label')).toBe('Reveal secret access key');
  });

  // Swapping the name between Show and Hide makes it read as a different
  // control each press. The name stays put and the state lives in aria-pressed.
  it('keeps the same name when pressed and reports state separately', () => {
    const { toggle } = renderInput();

    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-label')).toBe('Reveal secret access key');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('points at the field it controls', () => {
    const { toggle } = renderInput();

    expect(toggle.getAttribute('aria-controls')).toBe('secret');
  });

  it('is a button rather than a div, so it is keyboard operable', () => {
    const { toggle } = renderInput();

    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
  });

  // A pointer press must not pull the caret out of the field mid-typing.
  it('does not take focus from the input', () => {
    const { toggle } = renderInput();

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    toggle.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('state announcement', () => {
  it('describes the current state in a live region', () => {
    const { toggle } = renderInput();
    const status = document.getElementById('secret-status');

    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.textContent).toBe('secret access key is hidden');

    fireEvent.click(toggle);

    expect(status?.textContent).toBe('secret access key is visible');
  });

  it('links the status to the input', () => {
    const { input } = renderInput();

    expect(input.getAttribute('aria-describedby')).toBe('secret-status');
  });
});
