'use client';

import React, { useState, useEffect } from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { createS3PreviewService } from '@/services/s3-preview-service';
import { PreviewError } from '../preview-error';
import { PreviewLoading } from '../preview-loading';
import { getFileExtension, isFileInCategory } from '@/config/file-extensions';
import * as XLSX from 'xlsx';
import { useAuthGuard } from '@/hooks/use-auth-guard';

interface ExcelViewerProps {
  file: PreviewableFile;
}

function parseCSV(csvText: string): string[][] {
  const lines = csvText.split('\n');
  const result: string[][] = [];

  for (const line of lines) {
    if (line.trim() === '') continue;

    const row: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(currentField.trim());
        currentField = '';
        i++;
      } else {
        currentField += char;
        i++;
      }
    }

    row.push(currentField.trim());
    result.push(row);
  }

  return result;
}

export function ExcelViewer({ file }: ExcelViewerProps) {
  const [spreadsheetData, setSpreadsheetData] = useState<string[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { apiS3, isLoading, isAuthenticated } = useAuthGuard();

  if (isLoading) {
    return <PreviewLoading message="Authenticating..." />;
  }

  if (!isAuthenticated || !apiS3) {
    return null;
  }

  useEffect(() => {
    async function loadSpreadsheet() {
      if (!apiS3) return; // Additional safety check

      try {
        setLoading(true);
        setError(null);

        const s3PreviewService = createS3PreviewService(apiS3);
        const signedUrl = await s3PreviewService.getSignedUrl(file);

        const extension = getFileExtension(file.name);
        const response = await fetch(signedUrl);

        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        if (extension === '.csv') {
          const csvText = await response.text();
          setSpreadsheetData(parseCSV(csvText));
        } else if (isFileInCategory(file.name, 'spreadsheet') && extension !== '.csv') {
          const arrayBuffer = await response.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: false,
            defval: '',
          }) as string[][];
          setSpreadsheetData(jsonData);
        } else {
          throw new Error('Unsupported spreadsheet format');
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to load spreadsheet:', err);
        setError(err instanceof Error ? err.message : 'Failed to load spreadsheet');
        setLoading(false);
      }
    }

    loadSpreadsheet();
  }, [file.key, file.name]);

  const handleRetry = () => {
    setError(null);
    setSpreadsheetData(null);
    setLoading(true);
  };

  if (loading) {
    return <PreviewLoading message={`Loading ${file.name}...`} />;
  }

  if (error) {
    return <PreviewError title="Spreadsheet Preview Error" message={error} onRetry={handleRetry} />;
  }

  if (!spreadsheetData || spreadsheetData.length === 0) {
    return (
      <PreviewError
        title="Spreadsheet Preview Error"
        message="No spreadsheet data available"
        onRetry={handleRetry}
      />
    );
  }

  const maxRows = Math.min(spreadsheetData.length, 100);
  const maxCols = Math.min(spreadsheetData[0]?.length || 0, 20);

  return (
    <div
      className="w-full h-full overflow-auto p-4"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div
        className="rounded-lg shadow-lg border overflow-hidden"
        style={{
          backgroundColor: 'var(--card)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 border-b"
          style={{
            backgroundColor: 'var(--muted)',
            borderColor: 'var(--border)',
          }}
        >
          <h3 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
            {file.name}
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
            Showing first {maxRows} rows and {maxCols} columns
          </p>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          <table className="min-w-full">
            <thead className="sticky top-0" style={{ backgroundColor: 'var(--muted)' }}>
              <tr>
                <th
                  className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider sticky left-0 border-r z-10"
                  style={{
                    color: 'var(--muted-foreground)',
                    backgroundColor: 'var(--muted)',
                    borderColor: 'var(--border)',
                  }}
                >
                  #
                </th>
                {spreadsheetData?.[0]?.slice(0, maxCols).map((header, colIndex) => (
                  <th
                    key={colIndex}
                    className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider min-w-[120px] border-r"
                    style={{
                      color: 'var(--muted-foreground)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    {header || `Column ${colIndex + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ backgroundColor: 'var(--card)' }}>
              {spreadsheetData?.slice(1, maxRows).map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b hover:opacity-80 transition-opacity cursor-default"
                  style={{
                    backgroundColor: rowIndex % 2 === 0 ? 'var(--card)' : 'var(--muted)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <td
                    className="px-3 py-2 text-sm sticky left-0 border-r z-10"
                    style={{
                      color: 'var(--muted-foreground)',
                      backgroundColor: 'var(--muted)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    {rowIndex + 1}
                  </td>
                  {row.slice(0, maxCols).map((cell, colIndex) => (
                    <td
                      key={colIndex}
                      className="px-3 py-2 text-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] border-r transition-colors duration-150"
                      style={{
                        color: 'var(--foreground)',
                        borderColor: 'var(--border)',
                      }}
                      title={cell}
                    >
                      {cell}
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, maxCols - row.length) }, (_, i) => (
                    <td
                      key={`empty-${i}`}
                      className="px-3 py-2 text-sm border-r"
                      style={{
                        color: 'var(--muted-foreground)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      —
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
