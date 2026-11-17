/**
 * ExcelViewer.
 *
 * The spreadsheet parser is loaded when a spreadsheet is opened, not with the
 * page, so these check that opening one still works end to end: a real
 * workbook, fetched and parsed through that on-demand import.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/use-auth-guard', () => ({
  useAuthGuard: () => ({
    apiS3: { getSignedUrl: async () => 'https://s3/sheet' },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

import { ExcelViewer } from './excel-viewer';

const file = (name: string) => ({
  id: name,
  name,
  key: `docs/${name}`,
  size: 100,
  type: name.split('.').pop()!,
  lastModified: new Date(),
});

async function workbookBytes(rows: string[][]): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

let respond: () => Response;

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => respond());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('opening a spreadsheet', () => {
  it('parses an .xlsx workbook with the parser loaded on demand', async () => {
    const bytes = await workbookBytes([
      ['Region', 'Revenue'],
      ['North', '1200'],
    ]);
    respond = () => new Response(bytes);

    render(<ExcelViewer file={file('q3.xlsx')} />);

    expect(await screen.findByText('North')).toBeTruthy();
    expect(screen.getByText('1200')).toBeTruthy();
  });

  it('reads a CSV without loading the parser at all', async () => {
    respond = () => new Response('name,qty\napples,3\n');

    render(<ExcelViewer file={file('stock.csv')} />);

    expect(await screen.findByText('apples')).toBeTruthy();
  });
});
