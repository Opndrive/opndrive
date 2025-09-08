'use client';

import React, { useState, useEffect } from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { s3PreviewService } from '@/services/s3-preview-service';
import { PreviewError } from '../preview-error';
import { PreviewLoading } from '../preview-loading';
import * as XLSX from 'xlsx';

interface ExcelViewerProps {
  file: PreviewableFile;
}

function getFileExtension(filename: string): string {
  return filename.toLowerCase().substring(filename.lastIndexOf('.'));
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

  useEffect(() => {
    async function loadSpreadsheet() {
      try {
        setLoading(true);
        setError(null);

        const signedUrl = await s3PreviewService.getSignedUrl(file);

        const extension = getFileExtension(file.name);
        const response = await fetch(signedUrl);

        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        if (extension === '.csv') {
          const csvText = await response.text();
          setSpreadsheetData(parseCSV(csvText));
        } else if (['.xls', '.xlsx', '.xlsm', '.xlsb'].includes(extension)) {
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
    <div className="w-full h-full overflow-auto bg-white dark:bg-gray-950 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{file.name}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {spreadsheetData.length} rows × {spreadsheetData[0]?.length || 0} columns
            {maxRows < spreadsheetData.length && ` (showing first ${maxRows} rows)`}
            {maxCols < (spreadsheetData[0]?.length || 0) && ` (showing first ${maxCols} columns)`}
          </p>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky left-0 bg-gray-100 dark:bg-gray-700 border-r border-gray-200 dark:border-gray-600 z-10">
                  #
                </th>
                {spreadsheetData[0]?.slice(0, maxCols).map((header, colIndex) => (
                  <th
                    key={colIndex}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[120px] border-r border-gray-200 dark:border-gray-600"
                  >
                    {header || `Column ${colIndex + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {spreadsheetData.slice(1, maxRows).map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={
                    rowIndex % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'
                  }
                >
                  <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 sticky left-0 bg-gray-100 dark:bg-gray-700 border-r border-gray-200 dark:border-gray-600 z-10">
                    {rowIndex + 1}
                  </td>
                  {row.slice(0, maxCols).map((cell, colIndex) => (
                    <td
                      key={colIndex}
                      className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] border-r border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 cursor-default"
                      title={cell}
                    >
                      {cell}
                    </td>
                  ))}
                  {Array.from({ length: Math.max(0, maxCols - row.length) }, (_, i) => (
                    <td
                      key={`empty-${i}`}
                      className="px-3 py-2 text-sm text-gray-400 dark:text-gray-600 border-r border-gray-200 dark:border-gray-600"
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
