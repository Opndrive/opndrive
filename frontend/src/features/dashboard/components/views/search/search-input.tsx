'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { AriaLabel } from '@/shared/components/custom-aria-label';

interface SearchInputProps {
  initialQuery?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Simplified search input for the dedicated search page
 * Updates URL params on search, no dropdown
 */
export function SearchInput({
  initialQuery = '',
  placeholder = 'Search files and folders...',
  className = '',
  autoFocus = false,
}: SearchInputProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update local state when initialQuery changes (from URL)
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Auto-focus if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Clear existing debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Debounce URL update for 500ms
    debounceTimeoutRef.current = setTimeout(() => {
      if (value.trim()) {
        // Update URL with new search query
        router.push(`/dashboard/search?q=${encodeURIComponent(value.trim())}`);
      } else {
        // Clear search if empty
        router.push('/dashboard/search');
      }
    }, 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Clear timeout and immediately update URL
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      if (query.trim()) {
        router.push(`/dashboard/search?q=${encodeURIComponent(query.trim())}`);
      }
    } else if (e.key === 'Escape') {
      inputRef.current?.blur();
    }
  };

  const clearSearch = () => {
    // Clear debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    setQuery('');
    router.push('/dashboard/search');
    inputRef.current?.focus();
  };

  return (
    <div className={`relative ${className}`}>
      <Search
        className={`absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground transition-colors ${
          isFocused ? 'text-primary' : ''
        } h-5 w-5`}
      />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`
          w-full rounded-lg border transition-all duration-200 ease-out
          text-foreground placeholder:text-muted-foreground
          py-3 pl-12 text-base shadow-sm
          ${
            isFocused
              ? 'border-primary ring-2 ring-primary/20 bg-background shadow-lg'
              : 'border-border bg-input hover:border-primary/50 hover:shadow-md'
          }
          ${query ? 'pr-10' : 'pr-4'}
          focus:outline-none
        `}
      />
      {query && (
        <AriaLabel label="Clear search query" position="top">
          <button
            onClick={clearSearch}
            className="absolute cursor-pointer right-3 top-1/2 transform -translate-y-1/2 transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </AriaLabel>
      )}
    </div>
  );
}
