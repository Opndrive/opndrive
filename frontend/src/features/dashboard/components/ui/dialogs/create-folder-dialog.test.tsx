/**
 * Dialog accessibility.
 *
 * The hand-rolled dialogs had no `role="dialog"` and no `aria-modal`, trapped
 * no focus so Tab walked out behind a backdrop that still blocked the mouse,
 * never gave focus back to whatever opened them, and put Escape on an inner div
 * so it only worked while focus happened to be inside it.
 *
 * create-folder is the one the issue calls out for the Escape problem, so it
 * carries the shared assertions for the pattern the other four now follow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useState } from 'react';
import { CreateFolderDialog } from './create-folder-dialog';

const onConfirm = vi.fn();

/** Mounts the dialog behind a real trigger, so focus restore has a target. */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open dialog</button>
      <button>somewhere else</button>
      <CreateFolderDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        defaultName="Untitled folder"
      />
    </>
  );
}

const trigger = () => screen.getByRole('button', { name: 'open dialog' });

async function open() {
  render(<Harness />);
  await act(async () => {
    // Focus it first: jsdom does not move focus on click, and focus restore has
    // nothing to restore to if the trigger never held it.
    trigger().focus();
    trigger().click();
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('it announces itself as a dialog', () => {
  it('is not rendered until opened', () => {
    render(<Harness />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('exposes the dialog role and modal flag', async () => {
    await open();

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('gives the dialog an accessible name', async () => {
    await open();

    // Screen readers announced nothing but loose text before.
    expect(screen.getByRole('dialog', { name: /new folder/i })).toBeTruthy();
  });
});

describe('focus', () => {
  it('moves focus into the dialog, onto the name', async () => {
    await open();

    const input = screen.getByPlaceholderText('Folder name');
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('selects the default name so it can be typed over', async () => {
    await open();

    const input = screen.getByPlaceholderText('Folder name') as HTMLInputElement;
    await waitFor(() => expect(input.selectionStart).toBe(0));
    expect(input.selectionEnd).toBe('Untitled folder'.length);
  });

  it('returns focus to whatever opened it', async () => {
    await open();

    await act(async () => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Landing back at the top of the document is what a keyboard user got.
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });

  it('hides the page behind it from assistive tech', async () => {
    render(<Harness />);
    // Reachable before the dialog opens.
    expect(screen.queryByRole('button', { name: 'somewhere else' })).not.toBeNull();

    await act(async () => {
      trigger().focus();
      trigger().click();
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeNull());

    // The old backdrop blocked the mouse but not Tab or a screen reader, so
    // everything behind it stayed reachable while the dialog was up.
    expect(screen.queryByRole('button', { name: 'somewhere else' })).toBeNull();
  });
});

describe('dismissing', () => {
  it('closes on Escape regardless of where focus sits', async () => {
    await open();

    // Escape used to be bound to an inner div, so it depended on focus being
    // inside that particular element.
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes from its own close control', async () => {
    await open();

    await act(async () => {
      screen.getByRole('button', { name: 'Cancel create folder' }).click();
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('does not confirm when dismissed', async () => {
    await open();

    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('it still does its job', () => {
  it('creates a folder with the typed name', async () => {
    await open();

    const input = screen.getByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: 'Café ☕' } });

    await act(async () => {
      screen.getByRole('button', { name: 'Create' }).click();
    });

    expect(onConfirm).toHaveBeenCalledWith('Café ☕');
  });

  it('blocks a name that cannot work and says why', async () => {
    await open();

    const input = screen.getByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: 'a/b' } });

    expect(screen.getByText('Folder name cannot contain a slash.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create' })).toHaveProperty('disabled', true);
  });
});
