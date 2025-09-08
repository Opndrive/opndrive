'use client';

import React, { useState, useEffect } from 'react';
import { PreviewableFile } from '@/types/file-preview';
import { s3PreviewService } from '@/services/s3-preview-service';
import { PreviewError } from '../preview-error';
import { PreviewLoading } from '../preview-loading';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker - use local worker to avoid CORS issues
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

interface PDFViewerProps {
  file: PreviewableFile;
}

export function PDFViewer({ file }: PDFViewerProps) {
  const [_signedUrl, setSignedUrl] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);

  useEffect(() => {
    async function loadPDF() {
      try {
        setLoading(true);
        setError(null);

        const url = await s3PreviewService.getSignedUrl(file);

        setSignedUrl(url);

        // Fetch PDF data for react-pdf
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        setPdfData(arrayBuffer);

        setLoading(false);
      } catch (err) {
        console.error('Failed to load PDF:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setLoading(false);
      }
    }

    loadPDF();
  }, [file.key]);

  const handleRetry = () => {
    setError(null);
    setPdfData(null);
    setSignedUrl(null);
    setLoading(true);
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('PDF load error:', error);
    setError('Failed to load PDF document');
  };

  if (loading) {
    return <PreviewLoading message={`Loading PDF ${file.name}...`} />;
  }

  if (error) {
    return <PreviewError title="PDF Preview Error" message={error} onRetry={handleRetry} />;
  }

  if (!pdfData) {
    return (
      <PreviewError
        title="PDF Preview Error"
        message="No PDF data available"
        onRetry={handleRetry}
      />
    );
  }

  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 flex flex-col">
      {/* PDF Controls */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{file.name}</h3>
          {numPages > 0 && (
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {currentPage} of {numPages}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {/* Zoom Controls */}
          <button
            onClick={() => setScale(Math.max(0.5, scale - 0.1))}
            className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded"
            disabled={scale <= 0.5}
          >
            -
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale(Math.min(3, scale + 0.1))}
            className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded"
            disabled={scale >= 3}
          >
            +
          </button>

          {/* Page Navigation */}
          {numPages > 1 && (
            <>
              <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-2" />
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded"
                disabled={currentPage <= 1}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded"
                disabled={currentPage >= numPages}
              >
                Next
              </button>
            </>
          )}
        </div>
      </div>

      {/* PDF Document */}
      <div className="flex-1 overflow-auto flex justify-center p-4">
        <Document
          file={pdfData}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={<div className="text-center">Loading PDF...</div>}
          error={<div className="text-center text-red-500">Failed to load PDF</div>}
        >
          <Page
            pageNumber={currentPage}
            scale={scale}
            loading={<div className="text-center">Loading page...</div>}
            error={<div className="text-center text-red-500">Failed to load page</div>}
            className="shadow-lg"
          />
        </Document>
      </div>
    </div>
  );
}
