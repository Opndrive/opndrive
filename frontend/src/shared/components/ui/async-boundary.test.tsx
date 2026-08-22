/**
 * The boundary is the whole point of the change: a failed listing used to
 * render as a skeleton, because the page could reach the data without ever
 * asking whether the request had failed.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { AsyncBoundary, type AsyncState } from './async-boundary';
import { classifyConnectionFailure } from '@/lib/s3/connection-failure';

function sdkError(name: string, httpStatusCode?: number) {
  const error = new Error(name);
  error.name = name;

  return Object.assign(error, { $metadata: { httpStatusCode } });
}

const rows = ['a.txt', 'b.txt'];

function mount(state: AsyncState<string[]>) {
  return render(
    <AsyncBoundary state={state} pending={<div data-testid="skeleton" />}>
      {(data) => (
        <ul>
          {data.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      )}
    </AsyncBoundary>
  );
}

describe('what each state puts on screen', () => {
  it('shows the skeleton while loading', () => {
    mount({ state: 'loading' });

    expect(screen.getByTestId('skeleton')).toBeDefined();
  });

  it('shows the skeleton before anything has been asked for', () => {
    mount({ state: 'idle' });

    expect(screen.getByTestId('skeleton')).toBeDefined();
  });

  it('shows the data once it is ready', () => {
    mount({ state: 'ready', data: rows });

    expect(screen.getByText('a.txt')).toBeDefined();
    expect(screen.queryByTestId('skeleton')).toBeNull();
  });

  // The regression this whole change exists for.
  it('shows a failure, not a skeleton, when the request failed', () => {
    mount({ state: 'error', failure: classifyConnectionFailure(sdkError('AccessDenied', 403)) });

    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('announces the failure rather than only drawing it', () => {
    mount({ state: 'error', failure: classifyConnectionFailure(new TypeError('Failed to fetch')) });

    expect(screen.getByRole('alert').textContent).toContain('Could not reach your storage');
  });
});

describe('the way out', () => {
  it('offers a retry when trying again could work', () => {
    const retry = vi.fn();
    mount({
      state: 'error',
      failure: classifyConnectionFailure(new TypeError('Failed to fetch')),
      retry,
    });

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(retry).toHaveBeenCalledOnce();
  });

  // An unchanged wrong key fails the same way the second time. A button that
  // cannot succeed teaches people to distrust the ones that can.
  it('offers no retry when retrying cannot help', () => {
    mount({
      state: 'error',
      failure: classifyConnectionFailure(sdkError('SignatureDoesNotMatch', 403)),
      retry: vi.fn(),
    });

    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('offers no retry when the caller has no way to retry', () => {
    mount({ state: 'error', failure: classifyConnectionFailure(new TypeError('Failed to fetch')) });

    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it.each(['SignatureDoesNotMatch', 'NoSuchBucket'])(
    'points at /connect when %s is what went wrong',
    (name) => {
      mount({ state: 'error', failure: classifyConnectionFailure(sdkError(name)) });

      expect(screen.getByRole('link', { name: /connection details/i }).getAttribute('href')).toBe(
        '/connect'
      );
    }
  );

  // CORS is fixed in the provider's console, not by re-entering the same keys.
  it('does not send a network failure back to /connect', () => {
    mount({ state: 'error', failure: classifyConnectionFailure(new TypeError('Failed to fetch')) });

    expect(screen.queryByRole('link', { name: /connection details/i })).toBeNull();
  });
});
