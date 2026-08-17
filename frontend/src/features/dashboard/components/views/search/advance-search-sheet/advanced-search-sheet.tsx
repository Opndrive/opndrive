'use client';

import { X } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { Dropdown, Option } from '../dropdown';

const row = 'grid grid-cols-[200px_1fr] items-start gap-6';
const input =
  'w-full rounded border border-border bg-input p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: () => void;
}

const Checkbox = ({ label, checked, onChange }: CheckboxProps) => (
  <label className="flex cursor-pointer items-center gap-2">
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 rounded border-border bg-input text-primary focus:ring-primary"
    />
    <span className="text-sm text-foreground">{label}</span>
  </label>
);

interface AdvancedSearchSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Ties the panel to its heading, so screen readers announce what opened. */
const TITLE_ID = 'advanced-search-title';

export const AdvancedSearchSheet = ({ isOpen, onClose }: AdvancedSearchSheetProps) => {
  const typeOptions: Option[] = [
    { value: 'any', label: 'Any' },
    { value: 'photos', label: 'Photos & images', icon: 'photo' },
    { value: 'pdf', label: 'PDFs', icon: 'file-pdf' },
    { value: 'documents', label: 'Documents', icon: 'file-text' },
    { value: 'spreadsheets', label: 'Spreadsheets', icon: 'file-spreadsheet' },
    { value: 'presentations', label: 'Presentations', icon: 'file-presentation' },
    { value: 'forms', label: 'Forms', icon: 'file' },
    { value: 'audio', label: 'Audio', icon: 'headphones' },
    { value: 'videos', label: 'Videos', icon: 'film' },
    { value: 'archives', label: 'Archives (zip)', icon: 'archive' },
  ];

  const ownerOptions: Option[] = [
    { value: 'anyone', label: 'Anyone' },
    { value: 'me', label: 'Owned by me' },
    { value: 'not-me', label: 'Not owned by me' },
  ];

  const locationOptions: Option[] = [
    { value: 'anywhere', label: 'Anywhere' },
    { value: 'my-drive', label: 'My Drive' },
    { value: 'shared-drives', label: 'Shared drives' },
    { value: 'shared-with-me', label: 'Shared with me' },
  ];

  const dateOptions: Option[] = [
    { value: 'any', label: 'Any time' },
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last-week', label: 'Last week' },
    { value: 'last-month', label: 'Last month' },
    { value: 'last-year', label: 'Last year' },
  ];

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const panelRef = useRef<HTMLDivElement>(null);

  // On the document rather than the panel: an element-scoped handler only fires
  // while focus happens to be inside, which is the bug the other dialogs had.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  /**
   * Focus went nowhere when this opened, leaving a keyboard user on the search
   * bar behind it. Moving it to the panel puts them inside, and putting it back
   * on close returns them to where they came from rather than the top of the
   * document.
   *
   * Kept separate from the Escape effect and deliberately not keyed on
   * `onClose`: that is a prop, and an inline one would re-run this on every
   * render, yanking focus out of whichever field was being typed in.
   *
   * `mounted` is in the deps because the first render returns null - the panel
   * does not exist yet, so a run keyed on `isOpen` alone finds a null ref and
   * never fires again.
   */
  useEffect(() => {
    if (!mounted || !isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => previouslyFocused?.focus?.();
  }, [isOpen, mounted]);

  // Kept in step with the render condition below, so the page is never held
  // still before the sheet is actually on screen.
  useScrollLock(mounted && isOpen);

  const [type, setType] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [dateModified, setDateModified] = useState<string | null>(null);
  const [includesWords, setIncludesWords] = useState('');
  const [itemName, setItemName] = useState('');
  const [sharedTo, setSharedTo] = useState('');

  const [inBin, setInBin] = useState(false);
  const [starred, setStarred] = useState(false);
  const [encrypted, setEncrypted] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [requestedByMe, setRequestedByMe] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 0);
  };

  const handleReset = () => {
    setType(null);
    setOwner(null);
    setLocation(null);
    setDateModified(null);
    setIncludesWords('');
    setItemName('');
    setSharedTo('');
    setInBin(false);
    setStarred(false);
    setEncrypted(false);
    setAwaitingApproval(false);
    setRequestedByMe(false);
  };

  const handleSearch = () => {
    onClose();
  };

  if (!mounted || !isOpen) return null;

  const dialog: ReactNode = (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop. Hidden from assistive tech and left out of the tab order on
          purpose: it is a click shortcut, and Escape and the close button are
          the keyboard paths to the same thing. */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="flex min-h-full items-start lg:items-center justify-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={TITLE_ID}
          tabIndex={-1}
          className="relative z-10 flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-card shadow-2xl outline-none"
        >
          <div
            className={`sticky top-0 z-10 flex items-center justify-between px-8 py-6 transition-colors duration-200 ${isScrolled ? 'bg-accent' : 'bg-card'}`}
          >
            <h2 id={TITLE_ID} className="text-xl font-cansemibold text-foreground">
              Advanced search
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 cursor-pointer transition-colors hover:bg-border"
              aria-label="Close advanced search"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            style={{ scrollbarGutter: 'stable' }}
            className="flex-1 overflow-y-scroll px-8 py-6 custom-scrollbar"
            onScroll={handleScroll}
          >
            <div className="space-y-8">
              <div className={row}>
                <label className="pt-3 text-sm font-medium text-secondary-foreground">Type</label>
                <Dropdown
                  id="type-dropdown"
                  placeholder="Any"
                  value={type}
                  onChange={setType}
                  options={typeOptions}
                />
              </div>

              <div className={row}>
                <label className="pt-3 text-sm font-medium text-secondary-foreground">Owner</label>
                <Dropdown
                  id="owner-dropdown"
                  placeholder="Anyone"
                  value={owner}
                  onChange={setOwner}
                  options={ownerOptions}
                />
              </div>

              <div className={row}>
                <label className="pt-3 text-sm font-medium text-secondary-foreground">
                  Includes the words
                </label>
                <input
                  type="text"
                  placeholder="Enter words found in the file"
                  className={input}
                  value={includesWords}
                  onChange={(e) => setIncludesWords(e.target.value)}
                />
              </div>

              <div className={row}>
                <label className="pt-3 text-sm font-medium text-secondary-foreground">
                  Item name
                </label>
                <input
                  type="text"
                  placeholder="Enter a term that matches part of the file name"
                  className={input}
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>

              <div className={row}>
                <label className="pt-3 text-sm font-medium text-secondary-foreground">
                  Location
                </label>
                <div className="space-y-4">
                  <Dropdown
                    id="location-dropdown"
                    placeholder="Anywhere"
                    value={location}
                    onChange={setLocation}
                    options={locationOptions}
                    showIcons={false}
                  />
                  <div className="flex items-center gap-8">
                    <Checkbox label="In bin" checked={inBin} onChange={() => setInBin(!inBin)} />
                    <Checkbox
                      label="Starred"
                      checked={starred}
                      onChange={() => setStarred(!starred)}
                    />
                    <Checkbox
                      label="Encrypted"
                      checked={encrypted}
                      onChange={() => setEncrypted(!encrypted)}
                    />
                  </div>
                </div>
              </div>

              <div className={row}>
                <label className="pt-3 text-sm font-medium text-secondary-foreground">
                  Date modified
                </label>
                <Dropdown
                  id="date-dropdown"
                  placeholder="Any time"
                  value={dateModified}
                  onChange={setDateModified}
                  options={dateOptions}
                  showIcons={false}
                />
              </div>

              <div className={row}>
                <label className="pt-3 text-sm font-medium text-secondary-foreground">
                  Approvals and eSignatures
                </label>
                <div className="flex items-center gap-8">
                  <Checkbox
                    label="Awaiting my approval"
                    checked={awaitingApproval}
                    onChange={() => setAwaitingApproval(!awaitingApproval)}
                  />
                  <Checkbox
                    label="Requested by me"
                    checked={requestedByMe}
                    onChange={() => setRequestedByMe(!requestedByMe)}
                  />
                </div>
              </div>

              <div className={row}>
                <label className="pt-3 text-sm font-medium text-secondary-foreground">
                  Shared to
                </label>
                <input
                  type="text"
                  placeholder="Enter a name or email address…"
                  className={input}
                  value={sharedTo}
                  onChange={(e) => setSharedTo(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border px-8 py-6">
            <button
              type="button"
              className="text-sm cursor-pointer font-medium text-primary hover:underline"
            >
              Learn more
            </button>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg cursor-pointer px-6 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-muted"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleSearch}
                className="rounded-lg cursor-pointer bg-primary px-8 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
};
