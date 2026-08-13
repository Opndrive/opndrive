/**
 * PreviewContent error handling.
 *
 * The preview modal is rendered by the dashboard layout, which means no route
 * level error.tsx covers it: before the boundary, a viewer that threw on a
 * malformed pdf or spreadsheet took the whole dashboard down to a blank page.
 * These tests drive a viewer that throws for real and check that the damage
 * stops at the content panel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewContent } from './preview-content';
import type { PreviewableFile } from '@/types/file-preview';

const { pdfThrows } = vi.hoisted(() => ({ pdfThrows: { value: true } }));

vi.mock('./viewers/pdf-viewer', () => ({
  PDFViewer: () => {
    if (pdfThrows.value) {
      throw new Error('Invalid PDF structure');
    }
    return <div>pdf rendered</div>;
  },
}));
vi.mock('./viewers/image-viewer', () => ({ ImageViewer: () => <div>image rendered</div> }));
vi.mock('./viewers/video-viewer', () => ({ VideoViewer: () => <div>video rendered</div> }));
vi.mock('./viewers/audio-viewer', () => ({ AudioViewer: () => <div>audio rendered</div> }));
vi.mock('./viewers/excel-viewer', () => ({ ExcelViewer: () => <div>excel rendered</div> }));
vi.mock('./viewers/code-viewer', () => ({ CodeViewer: () => <div>code rendered</div> }));

vi.mock('@/features/dashboard/hooks/use-download', () => ({
  useDownloadActions: () => ({ downloadFile: vi.fn() }),
  useIsFileDownloading: () => false,
}));

function file(overrides: Partial<PreviewableFile> = {}): PreviewableFile {
  return {
    id: 'report',
    name: 'report.pdf',
    key: 'docs/report.pdf',
    size: 1024,
    ...overrides,
  };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  pdfThrows.value = true;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('a viewer that throws', () => {
  it('shows the preview error instead of blanking the modal', () => {
    render(<PreviewContent file={file()} />);

    expect(screen.getByText('Preview Failed')).toBeDefined();
    expect(screen.getByText(/report\.pdf could not be displayed/)).toBeDefined();
  });

  it('offers a retry that renders the viewer again', () => {
    render(<PreviewContent file={file()} />);

    pdfThrows.value = false;
    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));

    expect(screen.getByText('pdf rendered')).toBeDefined();
  });

  it('clears the failure when the user moves to another file', () => {
    const { rerender } = render(<PreviewContent file={file()} />);
    expect(screen.getByText('Preview Failed')).toBeDefined();

    rerender(<PreviewContent file={file({ id: 'photo', name: 'photo.png' })} />);

    expect(screen.getByText('image rendered')).toBeDefined();
    expect(screen.queryByText('Preview Failed')).toBeNull();
  });
});

describe('a viewer that works', () => {
  it('renders normally with no fallback in the way', () => {
    pdfThrows.value = false;
    render(<PreviewContent file={file()} />);

    expect(screen.getByText('pdf rendered')).toBeDefined();
    expect(screen.queryByText('Preview Failed')).toBeNull();
  });
});
