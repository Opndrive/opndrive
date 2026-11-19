/**
 * What a screen reader hears of a notification.
 *
 * These toasts are how a failed switch, a refused delete or a finished upload
 * is reported, so each one has to be a live region: an error interrupts, the
 * rest wait their turn. Without the roles a screen reader user heard nothing,
 * and a failure looked like nothing had happened.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Notification } from './notification';

describe('a notification', () => {
  it('interrupts with an error', () => {
    render(<Notification id="1" type="error" message="The bucket was not found." index={0} />);

    const region = screen.getByRole('alert');
    expect(region.getAttribute('aria-live')).toBe('assertive');
    expect(region.textContent).toContain('The bucket was not found.');
  });

  it.each(['success', 'info', 'warning'] as const)('waits its turn for %s', (type) => {
    render(<Notification id="1" type={type} message="Deleted Personal." index={0} />);

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
  });

  it('reads as its message, without the icon or the progress bar', () => {
    render(<Notification id="1" type="success" message="Deleted Personal." index={0} />);

    const region = screen.getByRole('status');
    const hidden = region.querySelectorAll('[aria-hidden="true"]');

    expect(hidden.length).toBeGreaterThanOrEqual(2);
    hidden.forEach((element) => expect(element.textContent).toBe(''));
  });

  it('has a close button that says what it closes', () => {
    render(<Notification id="1" type="info" message="Hello" index={0} />);

    const close = screen.getByRole('button', { name: 'Close notification' });
    expect(close.getAttribute('type')).toBe('button');
  });
});
