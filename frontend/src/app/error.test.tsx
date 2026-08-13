/**
 * Route level error boundaries.
 *
 * These are the App Router's special files, so nothing imports them and a
 * broken one only shows up when something has already gone wrong. The tests
 * pin the two things that matter: the user is told what happened, and the
 * recovery button is really wired to Next's reset callback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppError from './error';
import DashboardError from './dashboard/error';

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('app error boundary', () => {
  it('explains the failure and offers a way out', () => {
    render(<AppError error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByText('Something went wrong')).toBeDefined();
    // Home, not the dashboard: this boundary also covers the landing page
    expect(screen.getByRole('link', { name: 'Go to homepage' })).toHaveProperty(
      'href',
      expect.stringMatching(/\/$/)
    );
  });

  it('retries through Next reset callback', () => {
    const reset = vi.fn();
    render(<AppError error={new Error('boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledOnce();
  });

  it('logs the error rather than swallowing it', () => {
    const error = new Error('boom');
    render(<AppError error={error} reset={vi.fn()} />);

    expect(consoleError).toHaveBeenCalledWith('Unhandled render error:', error);
  });

  it('surfaces the digest so a report can be matched to a server log', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });
    render(<AppError error={error} reset={vi.fn()} />);

    expect(screen.getByText(/abc123/)).toBeDefined();
  });
});

describe('dashboard error boundary', () => {
  it('reassures the user that nothing was changed in the bucket', () => {
    render(<DashboardError error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByText('This view failed to load')).toBeDefined();
    expect(screen.getByText(/Nothing was changed in your bucket/)).toBeDefined();
  });

  it('offers an escape when retrying the same folder keeps failing', () => {
    render(<DashboardError error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Back to My Drive' })).toBeDefined();
  });

  it('retries through Next reset callback', () => {
    const reset = vi.fn();
    render(<DashboardError error={new Error('boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));

    expect(reset).toHaveBeenCalledOnce();
  });
});
