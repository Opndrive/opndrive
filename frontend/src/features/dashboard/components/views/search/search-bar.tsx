'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { useSearch } from '@/features/dashboard/hooks/use-search';
import { FileIcon } from '@/shared/components/icons/file-icons';
import { FolderIcon } from '@/shared/components/icons/folder-icons';
import { getFileExtensionWithoutDot, getEffectiveExtension } from '@/config/file-extensions';
import { useFilePreview } from '@/context/file-preview-context';
import { generateFolderUrl } from '@/features/folder-navigation/folder-navigation';
import {
  CreditWarningDialog,
  shouldShowCreditWarning,
} from '@/shared/components/ui/credit-warning-dialog';
import type { FileExtension } from '@/features/dashboard/types/file';
import type { _Object } from '@aws-sdk/client-s3';
import { AriaLabel } from '@/shared/components/custom-aria-label';

interface SearchSuggestion {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  key: string;
  extension?: string;
  location: string;
  size?: { value: number; unit: string };
  lastModified?: Date;
}

interface SearchBarProps {
  className?: string;
  placeholder?: string;
  variant?: 'default' | 'navbar';
}

export function SearchBar({
  className,
  placeholder = 'Search files and folders...',
  variant = 'default',
}: SearchBarProps) {
  const router = useRouter();
  const { openPreview } = useFilePreview();
  const [query, setQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [showCreditWarning, setShowCreditWarning] = useState(false);
  const [pendingSearchQuery, setPendingSearchQuery] = useState('');

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { search, isLoading, searchResults, cancelSearch } = useSearch();

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Format bytes utility function
  const formatBytes = (bytes: number | undefined): { value: number; unit: string } => {
    if (!bytes || bytes < 0) return { value: 0, unit: 'B' };

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let i = 0;

    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }

    return {
      value: parseFloat(size.toFixed(2)),
      unit: units[i],
    };
  };

  // Format relative time
  const formatRelativeTime = (date: Date | undefined): string => {
    if (!date) return 'Unknown';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  // Convert search results to suggestions and debounced search - only show up to 8 suggestions
  const suggestions: SearchSuggestion[] = (() => {
    if (!searchResults) return [];

    // Combine files and folders, limiting to 8 total suggestions
    const allItems: Array<{ item: _Object; type: 'file' | 'folder' }> = [
      ...searchResults.folders.slice(0, 4).map((f) => ({ item: f, type: 'folder' as const })),
      ...searchResults.files.slice(0, 4).map((f) => ({ item: f, type: 'file' as const })),
    ].slice(0, 8);

    return allItems.map(({ item, type }, index) => {
      const isFolder = type === 'folder';
      const pathParts = item.Key?.split('/') || [];

      let displayName: string;
      let displayPath: string;
      let location: string;

      if (isFolder) {
        // For folders, remove the trailing slash and get the folder name
        const folderPath = item.Key?.slice(0, -1) || ''; // Remove trailing /
        const folderParts = folderPath.split('/');
        displayName = folderParts[folderParts.length - 1] || folderPath; // Get last part as folder name
        displayPath = folderParts.length > 1 ? folderParts.slice(0, -1).join('/') : '/';
        location = folderParts.length > 1 ? folderParts[folderParts.length - 2] || 'Root' : 'Root';
      } else {
        // For files
        displayName = pathParts[pathParts.length - 1] || item.Key || '';
        displayPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '/';
        location = pathParts.length > 1 ? pathParts[pathParts.length - 2] || 'Root' : 'Root';
      }

      // Get file extension if it's a file
      const extension = !isFolder ? getFileExtensionWithoutDot(displayName) : undefined;

      return {
        id: `${item.Key}-${index}`,
        name: displayName,
        type,
        path: displayPath,
        key: item.Key || '',
        extension,
        location,
        size: !isFolder ? formatBytes(item.Size) : undefined,
        lastModified: item.LastModified,
      };
    });
  })();

  // Update dropdown position when search container moves or resizes
  const updateDropdownPosition = useCallback(() => {
    if (searchRef.current && isDropdownOpen) {
      const rect = searchRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const isMobile = viewportWidth < 640; // sm breakpoint

      if (isMobile) {
        // On mobile, use full width with padding
        setDropdownPosition({
          left: 16, // 16px padding from sides
          top: rect.bottom + 8,
          width: viewportWidth - 32, // Full width minus 32px total padding
        });
      } else {
        // On desktop, use input width
        setDropdownPosition({
          left: rect.left,
          top: rect.bottom + 8,
          width: rect.width,
        });
      }
    }
  }, [isDropdownOpen]);

  // Handle input changes with debouncing and credit warning
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setHighlightedIndex(-1);

    // Clear existing debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    if (value.trim().length >= 2) {
      // Debounce the search for 500ms
      debounceTimeoutRef.current = setTimeout(() => {
        if (shouldShowCreditWarning('search-operation')) {
          setPendingSearchQuery(value);
          setShowCreditWarning(true);
          setIsDropdownOpen(false);
        } else {
          executeSearch(value);
        }
      }, 500);
    } else {
      setIsDropdownOpen(false);
    }
  };

  const executeSearch = (searchQuery: string) => {
    // search automatically checks cache and only makes API call if needed
    search(searchQuery);
    setIsDropdownOpen(true);
  };

  const handleCreditWarningConfirm = () => {
    if (pendingSearchQuery) {
      // Check if this was triggered from "View All Results" by checking current context
      executeSearch(pendingSearchQuery);
    }
    setShowCreditWarning(false);
  };

  const handleCreditWarningClose = () => {
    setShowCreditWarning(false);
    setPendingSearchQuery('');
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSuggestionClick(suggestions[highlightedIndex]);
        } else {
          handleAllResultsClick();
        }
        break;
      case 'Escape':
        setIsDropdownOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    if (suggestion.type === 'file') {
      // Convert size back to bytes for preview size check
      let sizeInBytes = 0;
      if (suggestion.size) {
        const { value, unit } = suggestion.size;
        const multipliers: Record<string, number> = {
          B: 1,
          KB: 1024,
          MB: 1024 * 1024,
          GB: 1024 * 1024 * 1024,
          TB: 1024 * 1024 * 1024 * 1024,
        };
        sizeInBytes = value * (multipliers[unit] || 1);
      }

      // Open file preview
      const previewableFile = {
        id: suggestion.id,
        name: suggestion.name,
        key: suggestion.key,
        size: sizeInBytes,
        lastModified: suggestion.lastModified || new Date(),
        type: suggestion.extension || getFileExtensionWithoutDot(suggestion.name),
      };
      openPreview(previewableFile, [previewableFile]);
    } else {
      // Navigate to folder
      const folderUrl = generateFolderUrl({ prefix: suggestion.key });
      router.push(folderUrl);
    }

    setIsDropdownOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  // Handle "View All Results" click
  const handleAllResultsClick = () => {
    if (query.trim()) {
      if (shouldShowCreditWarning('search-operation')) {
        setPendingSearchQuery(query.trim());
        setShowCreditWarning(true);
        setIsDropdownOpen(false);
      } else {
        navigateToSearchResults(query.trim());
      }
    }
  };

  const navigateToSearchResults = (searchQuery: string) => {
    const searchParams = new URLSearchParams({ q: searchQuery });

    // Clear any existing timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }

    // Navigation to search page will use cached results automatically
    // No duplicate API call will be made - the search page checks cache first
    router.push(`/dashboard/search?${searchParams.toString()}`);

    // Keep dropdown visible during navigation for smooth UX
    // Close after a delay to allow search page to mount and render
    navigationTimeoutRef.current = setTimeout(() => {
      setIsDropdownOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }, 350); // 350ms provides smooth visual continuity
  };

  // Clear search
  const clearSearch = () => {
    // Clear debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // If currently loading, cancel the search
    if (isLoading) {
      cancelSearch();
    }

    setQuery('');
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  // Render file/folder icons using existing components
  const renderIcon = (suggestion: SearchSuggestion) => {
    if (suggestion.type === 'folder') {
      return <FolderIcon className="h-5 w-5 text-primary flex-shrink-0" />;
    }

    // Use the same pattern as file-item-list.tsx
    const extension = getEffectiveExtension(suggestion.name, suggestion.extension);
    return (
      <FileIcon
        extension={extension?.extension as FileExtension}
        filename={extension?.filename}
        className="h-5 w-5 flex-shrink-0"
      />
    );
  };

  // Update dropdown position when it opens/closes or on mount
  useEffect(() => {
    if (isDropdownOpen) {
      updateDropdownPosition();
    }
  }, [isDropdownOpen, updateDropdownPosition]);

  // Handle window events for responsive positioning
  useEffect(() => {
    const handleResize = () => updateDropdownPosition();
    const handleScroll = () => updateDropdownPosition();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [updateDropdownPosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Dropdown content
  const dropdownContent = isDropdownOpen && (
    <div
      ref={dropdownRef}
      className="bg-background border border-border/50 rounded-xl shadow-2xl z-[1000] max-h-[400px] sm:max-h-[400px] overflow-hidden"
      style={{
        boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {suggestions.length > 0 ? (
        <div className="overflow-y-auto max-h-[340px] sm:max-h-[340px] custom-scrollbar">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              onClick={() => handleSuggestionClick(suggestion)}
              className={`w-full flex cursor-pointer items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-left hover:bg-accent/50 transition-colors border-b border-border/30 last:border-b-0 ${
                index === highlightedIndex ? 'bg-accent/50' : ''
              }`}
            >
              {renderIcon(suggestion)}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {suggestion.name}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  {suggestion.lastModified && (
                    <span className="text-xs">{formatRelativeTime(suggestion.lastModified)}</span>
                  )}
                  {suggestion.size && (
                    <span className="text-xs">
                      {suggestion.size.value} {suggestion.size.unit}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <div className="text-xs text-muted-foreground capitalize px-1.5 sm:px-2 py-1 bg-muted/50 rounded text-center min-w-[3rem] sm:min-w-0">
                  {suggestion.type}
                </div>
                <div className="hidden sm:block text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded">
                  {suggestion.location}
                </div>
                {/* On mobile, show location in a more compact way */}
                <div className="sm:hidden text-xs px-1.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded max-w-[4rem] truncate">
                  {suggestion.location}
                </div>
              </div>
            </button>
          ))}

          {/* Loading indicator at bottom when search is in progress */}
          {isLoading && (
            <div className="p-3 text-center border-t border-border/30">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-xs font-medium">Loading more...</span>
              </div>
            </div>
          )}

          {/* View All Results Footer */}
          <div className="border-t border-border/30 bg-muted/10">
            <button
              onClick={handleAllResultsClick}
              className="w-full flex cursor-pointer items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 sm:py-4 text-left hover:bg-accent/20 transition-all duration-150 text-primary font-medium group"
            >
              <Search className="h-4 w-4 group-hover:scale-110 transition-transform flex-shrink-0" />
              <span className="text-sm flex-1 min-w-0">View all results for "{query}"</span>
              <div className="text-xs text-muted-foreground bg-primary/10 px-2 py-1 rounded-full flex-shrink-0">
                {searchResults?.totalKeys || 0}+
              </div>
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="p-4 sm:p-6 text-center">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm font-medium">Searching...</span>
          </div>
        </div>
      ) : query.trim().length >= 2 ? (
        <div className="p-6 sm:p-8 text-center text-muted-foreground">
          <Search className="h-10 sm:h-12 w-10 sm:w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium mb-1">No results found for "{query}"</p>
          <p className="text-xs opacity-60">Try different keywords or check your spelling</p>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <div className={`relative ${className}`} ref={searchRef}>
        <div className="relative">
          <Search
            className={`absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground transition-colors ${
              isFocused ? 'text-primary' : ''
            } ${variant === 'navbar' ? 'h-4 w-4' : 'h-5 w-5'}`}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (query.trim().length >= 2 && suggestions.length > 0) {
                setIsDropdownOpen(true);
              }
              setIsFocused(true);
            }}
            onBlur={() => setIsFocused(false)}
            className={`
              w-full rounded-full border transition-all duration-200 ease-out
              text-foreground placeholder:text-muted-foreground
              ${
                isFocused
                  ? 'border-primary ring-2 ring-primary/20 bg-background shadow-lg'
                  : 'border-border bg-input hover:border-primary/50 hover:shadow-md'
              }
              ${
                variant === 'navbar'
                  ? 'py-2.5 pl-12 text-sm w-full min-w-[500px] max-w-[650px] shadow-sm'
                  : 'py-3.5 pl-12 text-base shadow-sm'
              }
              ${query ? 'pr-10' : 'pr-4'}
              focus:outline-none
            `}
          />
          {query && (
            <AriaLabel label={isLoading ? 'Cancel search' : 'Clear search query'} position="top">
              <button
                onClick={clearSearch}
                className={`absolute cursor-pointer right-3 top-1/2 transform -translate-y-1/2 transition-colors ${
                  isLoading
                    ? 'text-destructive hover:text-destructive-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <X className="h-4 w-4" />
              </button>
            </AriaLabel>
          )}
        </div>
      </div>

      {/* Portal-based dropdown for proper z-index */}
      {typeof window !== 'undefined' &&
        dropdownContent &&
        dropdownPosition &&
        createPortal(
          <div
            className="fixed transition-all duration-200 ease-out"
            style={{
              left: dropdownPosition.left,
              top: dropdownPosition.top,
              width: dropdownPosition.width,
              zIndex: 1000,
              opacity: isDropdownOpen ? 1 : 0,
              transform: isDropdownOpen
                ? 'translateY(0) scale(1)'
                : 'translateY(-10px) scale(0.95)',
            }}
          >
            {dropdownContent}
          </div>,
          document.body
        )}

      {/* Credit Warning Dialog */}
      <CreditWarningDialog
        isOpen={showCreditWarning}
        onClose={handleCreditWarningClose}
        onConfirm={handleCreditWarningConfirm}
        operationType="search-operation"
      />
    </>
  );
}
