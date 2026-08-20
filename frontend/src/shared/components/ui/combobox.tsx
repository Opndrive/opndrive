'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: readonly ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  /** Lets the user commit a value that is not in the list. */
  allowCustomValue?: boolean;
  id?: string;
}

/**
 * A filterable select.
 *
 * This replaces CustomDropdown for long lists, and it is a rewrite rather than
 * a patch because the old component's problems came from its architecture.
 * That one rendered into a fixed-position portal, estimated its own height from
 * a hardcoded 40px per row, capped itself at six visible rows however much
 * space was free, and closed itself on any page scroll. The last one is the
 * reported bug: the natural response to a cramped list is to scroll, and
 * scrolling dismissed it.
 *
 * Here the panel is absolutely positioned inside the field's own wrapper, so it
 * moves with the page and cannot detach. Nothing listens for scroll to close.
 * Height is whatever fits, measured from the real viewport, not guessed.
 *
 * Filtering is the actual fix for AWS's 21 regions: typing "fra" beats any
 * amount of scrolling, and it is what the guidance recommends past roughly
 * seven options.
 */
export function Combobox({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select an option',
  disabled = false,
  allowCustomValue = false,
  id,
}: ComboboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const listboxId = `${controlId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropUp, setDropUp] = useState(false);
  const [maxHeight, setMaxHeight] = useState(288);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value);
  const displayValue = selected?.label ?? value;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;

    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle)
    );
  }, [options, query]);

  /** The custom value row, offered when nothing matches what was typed. */
  const customValue = useMemo(() => {
    if (!allowCustomValue) return null;

    const typed = query.trim();
    if (!typed) return null;
    if (options.some((option) => option.value === typed)) return null;

    return typed;
  }, [allowCustomValue, query, options]);

  const rowCount = filtered.length + (customValue ? 1 : 0);

  /**
   * Sizes the panel to the space that is actually available.
   *
   * Runs on open, and on scroll and resize while open. Deliberately does not
   * close on scroll, which is what the previous component did.
   */
  useEffect(() => {
    if (!isOpen) return;

    const measure = () => {
      const trigger = wrapperRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const preferUp = below < 200 && above > below;

      setDropUp(preferUp);
      setMaxHeight(Math.max(140, Math.min(preferUp ? above : below, 320)));
    };

    measure();

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen]);

  // Close when focus or a click goes elsewhere.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  // Keep the active row in view as the user arrows through it.
  useEffect(() => {
    if (!isOpen) return;

    const active = listRef.current?.querySelector('[data-active="true"]');

    // Guarded rather than assumed: scrollIntoView is optional in the DOM spec
    // and absent in jsdom, and keeping a row visible is not worth throwing over.
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, isOpen]);

  const commit = (next: string) => {
    onChange(next);
    setIsOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const rowValueAt = (index: number): string | null => {
    if (index < filtered.length) return filtered[index]?.value ?? null;
    return customValue;
  };

  const open = () => {
    if (disabled) return;
    setIsOpen(true);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault();
      open();
      return;
    }

    if (!isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((prev) => (rowCount === 0 ? 0 : (prev + 1) % rowCount));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((prev) => (rowCount === 0 ? 0 : (prev - 1 + rowCount) % rowCount));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(Math.max(0, rowCount - 1));
        break;
      case 'Enter': {
        event.preventDefault();
        const next = rowValueAt(activeIndex);
        if (next) commit(next);
        break;
      }
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setQuery('');
        break;
      case 'Tab':
        setIsOpen(false);
        setQuery('');
        break;
      default:
        break;
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        className={`flex items-center gap-2 rounded-md border bg-background px-3 transition-colors ${
          isOpen ? 'border-transparent ring-2 ring-primary' : 'border-border'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        {isOpen && <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />}

        <input
          ref={inputRef}
          id={controlId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label={label}
          aria-activedescendant={
            isOpen && rowCount > 0 ? `${controlId}-row-${activeIndex}` : undefined
          }
          autoComplete="off"
          disabled={disabled}
          className="w-full bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          placeholder={isOpen ? 'Type to filter...' : placeholder}
          value={isOpen ? query : displayValue}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={open}
          onKeyDown={handleKeyDown}
        />

        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </div>

      {isOpen && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={label}
          style={{ maxHeight }}
          className={`absolute left-0 right-0 z-50 overflow-y-auto rounded-md border border-border bg-card py-1 shadow-lg ${
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {rowCount === 0 && (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">No regions match that</li>
          )}

          {filtered.map((option, index) => (
            <li key={option.value}>
              <button
                type="button"
                id={`${controlId}-row-${index}`}
                role="option"
                aria-selected={option.value === value}
                data-active={index === activeIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(option.value)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                  index === activeIndex ? 'bg-accent' : ''
                } ${option.value === value ? 'text-primary' : 'text-foreground'}`}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value && <Check className="h-4 w-4 flex-shrink-0" aria-hidden />}
              </button>
            </li>
          ))}

          {customValue && (
            <li>
              <button
                type="button"
                id={`${controlId}-row-${filtered.length}`}
                role="option"
                aria-selected={false}
                data-active={activeIndex === filtered.length}
                onMouseEnter={() => setActiveIndex(filtered.length)}
                onClick={() => commit(customValue)}
                className={`w-full px-3 py-2.5 text-left text-sm text-foreground transition-colors ${
                  activeIndex === filtered.length ? 'bg-accent' : ''
                }`}
              >
                Use <span className="font-medium">{customValue}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
