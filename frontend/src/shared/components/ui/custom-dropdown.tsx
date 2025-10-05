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
  allowCustomValue?: boolean;
  customValuePlaceholder?: string;
}

export function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  className = '',
  allowCustomValue = false,
  customValuePlaceholder = 'Enter custom value...',
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 240,
    openUpward: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((option) => option.value === value);
  const isCustomValue = allowCustomValue && !selectedOption && value;

  const updateDropdownPosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Calculate dropdown height considering custom input
      const customInputHeight = showCustomInput ? 80 : 0; // Custom input section height
      const baseDropdownHeight = Math.min(240, options.length * 40 + 8);
      const totalDropdownHeight = baseDropdownHeight + customInputHeight;

      const shouldOpenUpward = spaceBelow < totalDropdownHeight && spaceAbove > spaceBelow;

      // Ensure dropdown doesn't go off-screen horizontally
      let leftPosition = rect.left;
      if (leftPosition + rect.width > viewportWidth - 16) {
        leftPosition = viewportWidth - rect.width - 16;
      }
      if (leftPosition < 16) {
        leftPosition = 16;
      }

      setDropdownPosition({
        top: shouldOpenUpward ? rect.top - totalDropdownHeight - 4 : rect.bottom + 4,
        left: leftPosition,
        width: rect.width,
        maxHeight: shouldOpenUpward
          ? Math.min(240, spaceAbove - 8 - customInputHeight)
          : Math.min(240, spaceBelow - 8 - customInputHeight),
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

  // Update dropdown position when custom input state changes
  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
    }
  }, [showCustomInput]);

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
      if (!isOpen || showCustomInput) return;

      const enabledOptions = options.filter((option) => !option.disabled);
      const totalOptions = enabledOptions.length + (allowCustomValue ? 1 : 0);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return 0;
          return (prev + 1) % totalOptions;
        });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((prev) => {
          if (prev <= 0) return totalOptions - 1;
          return prev - 1;
        });
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (focusedIndex >= 0) {
          if (focusedIndex === options.length && allowCustomValue) {
            handleSelect('__custom__');
          } else if (focusedIndex < options.length && !options[focusedIndex]?.disabled) {
            handleSelect(options[focusedIndex].value);
          }
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
      if (optionValue === '__custom__') {
        setShowCustomInput(true);
        setCustomValue('');
        // Don't close dropdown, show custom input instead
        setTimeout(() => {
          customInputRef.current?.focus();
        }, 0);
      } else {
        onChange(optionValue);
        setIsOpen(false);
        setFocusedIndex(-1);
        setShowCustomInput(false);
        triggerRef.current?.focus();
      }
    }
  };

  const handleCustomValueSubmit = () => {
    if (customValue.trim()) {
      onChange(customValue.trim());
      setIsOpen(false);
      setFocusedIndex(-1);
      setShowCustomInput(false);
      setCustomValue('');
      triggerRef.current?.focus();
    }
  };

  const handleCustomValueCancel = () => {
    setShowCustomInput(false);
    setCustomValue('');
    setFocusedIndex(-1);
  };

  const dropdownContent =
    isOpen && typeof window !== 'undefined'
      ? createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-card border border-border rounded-md shadow-xl overflow-hidden backdrop-blur-sm"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              maxHeight: dropdownPosition.maxHeight + (showCustomInput ? 80 : 0),
            }}
          >
            <div
              className="overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-muted-foreground"
              style={{
                maxHeight: showCustomInput
                  ? dropdownPosition.maxHeight + 78 // Full height when custom input is shown
                  : dropdownPosition.maxHeight - 2,
              }}
            >
              {showCustomInput ? (
                // Custom input field
                <div className="px-3 py-3 bg-muted/30 border-b border-border">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Enter custom value:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        ref={customInputRef}
                        type="text"
                        value={customValue}
                        onChange={(e) => setCustomValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCustomValueSubmit();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCustomValueCancel();
                          }
                        }}
                        placeholder={customValuePlaceholder}
                        className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                      />
                      <button
                        onClick={handleCustomValueSubmit}
                        disabled={!customValue.trim()}
                        className="px-3 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Add
                      </button>
                      <button
                        onClick={handleCustomValueCancel}
                        className="px-3 py-2 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {options.map((option, index) => (
                    <button
                      key={option.value}
                      onClick={() => handleSelect(option.value, option.disabled)}
                      onMouseEnter={() => setFocusedIndex(index)}
                      disabled={option.disabled}
                      className={`
                    w-full px-3 py-2.5 text-left text-sm cursor-pointer transition-colors flex items-center justify-between
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

                  {allowCustomValue && (
                    <>
                      <div className="border-t border-border my-1" />
                      <button
                        onClick={() => handleSelect('__custom__')}
                        onMouseEnter={() => setFocusedIndex(options.length)}
                        className={`
                          w-full px-3 py-2.5 text-left text-sm cursor-pointer transition-colors flex items-center gap-2
                          text-muted-foreground hover:bg-accent hover:text-accent-foreground
                          ${focusedIndex === options.length ? 'bg-accent/50' : ''}
                        `}
                      >
                        <span className="text-primary">+</span>
                        <span>Enter custom value...</span>
                      </button>
                    </>
                  )}
                </>
              )}
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
          relative w-full px-3 py-2 text-left cursor-pointer bg-background border border-input rounded-md
          transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
          ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-accent'}
          ${className}
        `}
      >
        <span
          className={`block truncate ${selectedOption || isCustomValue ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {selectedOption ? selectedOption.label : isCustomValue ? value : placeholder}
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
