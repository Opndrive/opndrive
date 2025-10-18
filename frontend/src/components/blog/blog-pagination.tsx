'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface BlogPaginationProps {
  currentPage: number;
  totalPages: number;
}

export function BlogPagination({ currentPage, totalPages }: BlogPaginationProps) {
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];

    if (totalPages <= 7) {
      // Show all pages if total is 7 or less
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  const getPageUrl = (page: number) => {
    return page === 1 ? '/blog' : `/blog?page=${page}`;
  };

  return (
    <div className="flex items-center justify-center gap-2">
      {/* Previous Button */}
      {currentPage > 1 ? (
        <Link
          href={getPageUrl(currentPage - 1)}
          className="flex items-center justify-center px-5 h-10 sm:h-12 rounded-lg bg-card text-foreground gap-2 transition-all duration-200 hover:opacity-80"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Previous</span>
        </Link>
      ) : (
        <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-card text-muted-foreground opacity-50 cursor-not-allowed">
          <ChevronLeft className="w-5 h-5" />
        </div>
      )}

      {/* Page Numbers */}
      <div className="flex items-center gap-2">
        {pageNumbers.map((page, index) => {
          if (page === '...') {
            return (
              <span
                key={`ellipsis-${index}`}
                className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 text-sm sm:text-base font-medium text-muted-foreground"
              >
                ...
              </span>
            );
          }

          const pageNum = page as number;
          const isActive = pageNum === currentPage;

          return (
            <Link
              key={pageNum}
              href={getPageUrl(pageNum)}
              className={`flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg text-sm sm:text-base font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-foreground hover:opacity-80'
              }`}
            >
              {pageNum}
            </Link>
          );
        })}
      </div>

      {/* Next Button */}
      {currentPage < totalPages ? (
        <Link
          href={getPageUrl(currentPage + 1)}
          className="flex items-center justify-center px-5 h-10 sm:h-12 rounded-lg bg-card text-foreground gap-2 transition-all duration-200 hover:opacity-80"
        >
          <span>Next</span>
          <ChevronRight className="w-5 h-5" />
        </Link>
      ) : (
        <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-card text-muted-foreground border border-border opacity-50 cursor-not-allowed">
          <ChevronRight className="w-5 h-5" />
        </div>
      )}
    </div>
  );
}
