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
// global-error carries its own stylesheet, since it replaces the root layout.
// Vitest has no PostCSS pipeline, so the import is stubbed out here.
vi.mock('@/app/globals.css', () => ({}));

import AppError from './error';
import DashboardError from './dashboard/error';
import GlobalError from './global-error';

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

/**
 * global-error replaces the root layout, so it renders its own html and body.
 * React warns about that nesting under a test container, which is noise here
 * rather than a defect: the assertions are about behaviour, not the wrapper.
 */
describe('global error boundary', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('tells the user the app could not start', () => {
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByText('Opndrive could not start')).toBeDefined();
  });

  it('retries through Next reset callback', () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error('boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledOnce();
  });

  it('offers a hard reload, since retrying often hits the same broken layout', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload the page' }));

    expect(reload).toHaveBeenCalledOnce();
  });

  it('restores an explicitly chosen theme, which the root layout script never got to set', () => {
    localStorage.setItem('ui-theme', 'dark');

    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('leaves the theme to the system preference when none was chosen', () => {
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />);

    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
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
