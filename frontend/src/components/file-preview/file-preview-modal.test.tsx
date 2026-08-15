/**
 * Preview modal accessibility.
 *
 * This one is not a Radix dialog. It embeds the pdf, monaco and xlsx viewers,
 * which manage focus themselves, so a focus trap wrapped around them is a good
 * way to break a viewer quietly. It gets the dialog semantics and the focus
 * moves by hand instead, which means nothing enforces them but these tests.
 *
 * The arrow-key navigation between files predates this and has to keep working,
 * so it is covered here too.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FilePreviewModal } from './file-preview-modal';

const preview = vi.hoisted(() => ({
  value: {
    isOpen: false,
    file: null as unknown,
    currentIndex: 0,
    files: [] as unknown[],
    closePreview: vi.fn(),
    navigateNext: vi.fn(),
    navigatePrevious: vi.fn(),
  },
}));

vi.mock('@/context/file-preview-context', () => ({
  useFilePreview: () => preview.value,
}));

// The header and the viewers pull in S3, monaco and pdf. None of that is what
// this file is about.
vi.mock('./preview-header', () => ({ PreviewHeader: () => <button>Close preview</button> }));
vi.mock('./preview-content', () => ({ PreviewContent: () => <div>viewer</div> }));

const file = { id: 'q3.pdf', name: 'q3.pdf', key: 'q3.pdf' };
const second = { id: 'q4.pdf', name: 'q4.pdf', key: 'q4.pdf' };

function show(overrides: Partial<typeof preview.value> = {}) {
  preview.value = { ...preview.value, ...overrides };
  return render(
    <>
      <button>the row behind</button>
      <FilePreviewModal />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  preview.value = {
    ...preview.value,
    isOpen: false,
    file: null,
    currentIndex: 0,
    files: [],
  };
});

describe('dialog semantics', () => {
  it('renders nothing when closed', () => {
    show({ isOpen: false, file });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('announces itself as a modal dialog named for the file', () => {
    show({ isOpen: true, file, files: [file] });

    const dialog = screen.getByRole('dialog', { name: 'Preview of q3.pdf' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('keeps the click-to-close backdrop out of the accessibility tree', () => {
    const { container } = show({ isOpen: true, file, files: [file] });

    // A bare clickable div with no keyboard path should not be announced; the
    // close button and Escape are the real ways out.
    const backdrop = container.querySelector('.absolute.inset-0');
    expect(backdrop?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('focus', () => {
  it('moves focus into the dialog when it opens', async () => {
    show({ isOpen: true, file, files: [file] });

    // It used to leave focus on the row behind, so a keyboard user carried on
    // tabbing through a page they could no longer see.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')));
  });

  it('gives focus back to whatever opened it', async () => {
    const { rerender } = render(
      <>
        <button>the row behind</button>
        <FilePreviewModal />
      </>
    );

    const row = screen.getByRole('button', { name: 'the row behind' });
    row.focus();
    expect(document.activeElement).toBe(row);

    preview.value = { ...preview.value, isOpen: true, file, files: [file] };
    await act(async () => {
      rerender(
        <>
          <button>the row behind</button>
          <FilePreviewModal />
        </>
      );
    });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')));

    preview.value = { ...preview.value, isOpen: false };
    await act(async () => {
      rerender(
        <>
          <button>the row behind</button>
          <FilePreviewModal />
        </>
      );
    });

    // Landing on the body would drop a keyboard user at the top of the page.
    await waitFor(() => expect(document.activeElement).toBe(row));
  });
});

describe('the keys it already answered still work', () => {
  it('closes on Escape', () => {
    show({ isOpen: true, file, files: [file] });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(preview.value.closePreview).toHaveBeenCalled();
  });

  it('walks to the next file on ArrowRight', () => {
    show({ isOpen: true, file, files: [file, second], currentIndex: 0 });

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(preview.value.navigateNext).toHaveBeenCalled();
  });

  it('walks back on ArrowLeft', () => {
    show({ isOpen: true, file: second, files: [file, second], currentIndex: 1 });

    fireEvent.keyDown(document, { key: 'ArrowLeft' });

    expect(preview.value.navigatePrevious).toHaveBeenCalled();
  });

  it('does not walk past the last file', () => {
    show({ isOpen: true, file: second, files: [file, second], currentIndex: 1 });

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(preview.value.navigateNext).not.toHaveBeenCalled();
  });

  it('does not walk before the first file', () => {
    show({ isOpen: true, file, files: [file, second], currentIndex: 0 });

    fireEvent.keyDown(document, { key: 'ArrowLeft' });

    expect(preview.value.navigatePrevious).not.toHaveBeenCalled();
  });
});
