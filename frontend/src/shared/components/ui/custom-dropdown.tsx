'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  className = '',
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 240,
    openUpward: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((option) => option.value === value);

  const updateDropdownPosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = Math.min(240, options.length * 40 + 8); // Estimate dropdown height

      const shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

      setDropdownPosition({
        top: shouldOpenUpward ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: shouldOpenUpward ? Math.min(240, spaceAbove - 8) : Math.min(240, spaceBelow - 8),
        openUpward: shouldOpenUpward,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();

      const handleResize = () => {
        updateDropdownPosition();
      };

      const handleScroll = (event: Event) => {
        // Don't close if scrolling inside the dropdown
        if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
          return;
        }

        // Close dropdown on page scroll for better UX
        setIsOpen(false);
        setFocusedIndex(-1);
      };

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setFocusedIndex(-1);
        triggerRef.current?.focus();
      }
    };

    const handleArrowKeys = (event: KeyboardEvent) => {
      if (!isOpen) return;

      const enabledOptions = options.filter((option) => !option.disabled);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((prev) => {
          const currentIndex = enabledOptions.findIndex(
            (option) => option.value === options[prev]?.value
          );
          const nextIndex = currentIndex < enabledOptions.length - 1 ? currentIndex + 1 : 0;
          return options.findIndex((option) => option.value === enabledOptions[nextIndex].value);
        });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((prev) => {
          const currentIndex = enabledOptions.findIndex(
            (option) => option.value === options[prev]?.value
          );
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : enabledOptions.length - 1;
          return options.findIndex((option) => option.value === enabledOptions[prevIndex].value);
        });
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (focusedIndex >= 0 && !options[focusedIndex]?.disabled) {
          handleSelect(options[focusedIndex].value);
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('keydown', handleArrowKeys);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('keydown', handleArrowKeys);
      };
    }
  }, [isOpen, focusedIndex, options]);

  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      setFocusedIndex(-1);
    }
  };

  const handleSelect = (optionValue: string, optionDisabled?: boolean) => {
    if (!optionDisabled) {
      onChange(optionValue);
      setIsOpen(false);
      setFocusedIndex(-1);
      triggerRef.current?.focus();
    }
  };

  const dropdownContent =
    isOpen && typeof window !== 'undefined'
      ? createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-card border border-border rounded-md shadow-lg overflow-hidden"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: dropdownPosition.maxHeight,
            }}
          >
            <div
              className="overflow-y-auto py-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-muted-foreground"
              style={{ maxHeight: dropdownPosition.maxHeight - 2 }}
            >
              {options.map((option, index) => (
                <button
                  key={option.value}
                  onClick={() => handleSelect(option.value, option.disabled)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  disabled={option.disabled}
                  className={`
                w-full px-3 py-2.5 text-left text-sm transition-colors flex items-center justify-between
                ${
                  option.disabled
                    ? 'text-muted-foreground cursor-not-allowed opacity-50'
                    : 'text-foreground hover:bg-accent cursor-pointer'
                }
                ${value === option.value ? 'bg-accent text-accent-foreground' : ''}
                ${focusedIndex === index && !option.disabled ? 'bg-accent/50' : ''}
              `}
                >
                  <span className="truncate pr-2">{option.label}</span>
                  {value === option.value && (
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`
          relative w-full px-3 py-2 text-left bg-background border border-input rounded-md
          transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
          ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-accent'}
          ${className}
        `}
      >
        <span
          className={`block truncate ${selectedOption ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </span>
      </button>
      {dropdownContent}
    </>
  );
}
