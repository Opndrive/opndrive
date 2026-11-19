import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { OfflineBanner } from './offline-banner';

let online = true;

afterEach(() => {
  vi.restoreAllMocks();
});

function goOnline(value: boolean) {
  online = value;
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

describe('OfflineBanner', () => {
  it('shows nothing while online', () => {
    online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);

    render(<OfflineBanner />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says so the moment the connection drops, and goes when it is back', () => {
    online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    render(<OfflineBanner />);

    goOnline(false);
    expect(screen.getByRole('status').textContent).toMatch(/you.re offline/i);
    expect(screen.getByRole('status').textContent).toMatch(
      /uploads that were interrupted carry on/i
    );

    goOnline(true);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
