'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Share, Copy, Clock, Link as LinkIcon, Check, ChevronDown } from 'lucide-react';
import { useShare } from '@/context/share-context';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DurationOption {
  label: string;
  value: number; // in seconds
  description: string;
}

const DURATION_OPTIONS: DurationOption[] = [
  { label: '15 minutes', value: 900, description: 'Perfect for quick review' },
  { label: '30 minutes', value: 1800, description: 'Short meeting duration' },
  { label: '1 hour', value: 3600, description: 'Standard sharing period' },
  { label: '6 hours', value: 21600, description: 'Extended work session' },
  { label: '1 day', value: 86400, description: 'Good for daily collaboration' },
  { label: '3 days', value: 259200, description: 'Extended access period' },
  { label: '1 week', value: 604800, description: 'Maximum duration (S3 limit)' },
];

const UNIT_OPTIONS = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
];

export const ShareDialog: React.FC<ShareDialogProps> = ({ isOpen, onClose }) => {
  const { shareDialog, generateShareLink, copyToClipboard, isGenerating } = useShare();
  const [selectedDuration, setSelectedDuration] = useState<DurationOption>(DURATION_OPTIONS[4]); // Default to 1 day
  const [customDuration, setCustomDuration] = useState<string>('');
  const [customUnit, setCustomUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [useCustomDuration, setUseCustomDuration] = useState<boolean>(false);
  const [shareResult, setShareResult] = useState<{ url: string; expiresAt: Date } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [unitDropdownOpen, setUnitDropdownOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const unitContainerRef = useRef<HTMLDivElement>(null);
  const unitTriggerRef = useRef<HTMLButtonElement>(null);
  const unitDropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [unitDropdownPosition, setUnitDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Handle main dropdown
      const isOutsideTrigger = triggerRef.current && !triggerRef.current.contains(target);
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target);

      if (isOutsideTrigger && isOutsideDropdown && dropdownOpen) {
        setDropdownOpen(false);
      }

      // Handle unit dropdown
      const isOutsideUnitTrigger =
        unitTriggerRef.current && !unitTriggerRef.current.contains(target);
      const isOutsideUnitDropdown =
        unitDropdownRef.current && !unitDropdownRef.current.contains(target);

      if (isOutsideUnitTrigger && isOutsideUnitDropdown && unitDropdownOpen) {
        setUnitDropdownOpen(false);
      }
    };

    if (dropdownOpen || unitDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen, unitDropdownOpen]);

  // Calculate dropdown position
  useEffect(() => {
    if (dropdownOpen && triggerRef.current) {
      // Use setTimeout to ensure positioning happens after render
      setTimeout(() => {
        if (triggerRef.current) {
          const triggerRect = triggerRef.current.getBoundingClientRect();
          const dropdownHeight = 240; // Approximate max height
          const viewportHeight = window.innerHeight;
          const spaceBelow = viewportHeight - triggerRect.bottom;
          const spaceAbove = triggerRect.top;

          let top = triggerRect.bottom + 4; // Default: below trigger

          // If not enough space below, position above
          if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
            top = triggerRect.top - dropdownHeight - 4;
          }

          setDropdownPosition({
            top,
            left: triggerRect.left,
            width: triggerRect.width,
          });
        }
      }, 0);
    } else {
      setDropdownPosition(null);
    }
  }, [dropdownOpen]);

  // Calculate unit dropdown position
  useEffect(() => {
    if (unitDropdownOpen && unitTriggerRef.current) {
      setTimeout(() => {
        if (unitTriggerRef.current) {
          const triggerRect = unitTriggerRef.current.getBoundingClientRect();
          const dropdownHeight = 120; // Smaller height for unit options
          const viewportHeight = window.innerHeight;
          const spaceBelow = viewportHeight - triggerRect.bottom;
          const spaceAbove = triggerRect.top;

          let top = triggerRect.bottom + 4;

          if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
            top = triggerRect.top - dropdownHeight - 4;
          }

          setUnitDropdownPosition({
            top,
            left: triggerRect.left,
            width: triggerRect.width,
          });
        }
      }, 0);
    } else {
      setUnitDropdownPosition(null);
    }
  }, [unitDropdownOpen]);

  // Close dropdown when switching to custom duration
  useEffect(() => {
    if (useCustomDuration) {
      setDropdownOpen(false);
    }
  }, [useCustomDuration]);

  if (!isOpen || !shareDialog.file) return null;

  const handleGenerateLink = async () => {
    let durationInSeconds = selectedDuration.value;

    if (useCustomDuration && customDuration) {
      const customValue = parseInt(customDuration);
      if (customValue > 0) {
        let multiplier = 1;
        switch (customUnit) {
          case 'minutes':
            multiplier = 60;
            break;
          case 'hours':
            multiplier = 3600;
            break;
          case 'days':
            multiplier = 86400;
            break;
        }
        durationInSeconds = customValue * multiplier;
      }
    }

    const result = await generateShareLink(durationInSeconds);
    if (result) {
      setShareResult(result);
    }
  };

  const handleCopy = async () => {
    if (shareResult) {
      const success = await copyToClipboard(shareResult.url);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleClose = () => {
    setShareResult(null);
    setCopied(false);
    setCustomDuration('');
    setUseCustomDuration(false);
    setSelectedDuration(DURATION_OPTIONS[4]);
    setCustomUnit('hours');
    onClose();
  };

  const formatExpiryDate = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isValidCustomDuration = () => {
    if (!useCustomDuration) return true;
    const value = parseInt(customDuration);
    if (isNaN(value) || value <= 0) return false;

    // AWS S3 signed URLs have a maximum of 7 days (604800 seconds)
    const maxSeconds = 604800; // 7 days
    let durationInSeconds = 0;

    switch (customUnit) {
      case 'minutes':
        durationInSeconds = value * 60;
        return value >= 1 && durationInSeconds <= maxSeconds; // Max ~10080 minutes (7 days)
      case 'hours':
        durationInSeconds = value * 3600;
        return value >= 1 && durationInSeconds <= maxSeconds; // Max 168 hours (7 days)
      case 'days':
        durationInSeconds = value * 86400;
        return value >= 1 && durationInSeconds <= maxSeconds; // Max 7 days
      default:
        return false;
    }
  };

  const dialogContent = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
        onClick={handleClose}
      />

      <div
        className="relative rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <Share className="h-5 w-5" style={{ color: 'var(--primary)' }} />
            <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
              Share file
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-full cursor-pointer hover:bg-accent transition-colors"
            style={{ color: 'var(--muted-foreground)' }}
            aria-label="Close share dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!shareResult ? (
          <>
            {/* File Info */}
            <div className="px-6 py-4">
              <div
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{ backgroundColor: 'var(--muted)' }}
              >
                <LinkIcon className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--primary)' }} />
                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium text-sm truncate"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {shareDialog.file.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    Generate a secure sharing link
                  </p>
                </div>
              </div>
            </div>

            {/* Duration Selection */}
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4" style={{ color: 'var(--primary)' }} />
                <label className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                  Link expires in:
                </label>
              </div>

              <div className="space-y-3">
                {/* Duration Dropdown */}
                <div className="relative" ref={containerRef}>
                  <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    disabled={useCustomDuration}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-lg border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: useCustomDuration ? 'var(--muted)' : 'var(--background)',
                      borderColor: useCustomDuration ? 'var(--border)' : 'var(--primary)',
                      color: useCustomDuration ? 'var(--muted-foreground)' : 'var(--foreground)',
                      opacity: useCustomDuration ? 0.5 : 1,
                    }}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{selectedDuration.label}</span>
                      <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        {selectedDuration.description}
                      </span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>

                {/* Custom Duration Toggle */}
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input
                      type="checkbox"
                      id="custom-duration"
                      checked={useCustomDuration}
                      onChange={(e) => {
                        setUseCustomDuration(e.target.checked);
                      }}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: 'var(--primary)' }}
                    />
                  </div>
                  <label
                    htmlFor="custom-duration"
                    className="text-sm font-medium cursor-pointer"
                    style={{ color: 'var(--foreground)' }}
                  >
                    Set custom duration
                  </label>
                </div>

                {/* Custom Duration Input */}
                {useCustomDuration && (
                  <div
                    className="p-3 rounded-lg border"
                    style={{ backgroundColor: 'var(--muted)', borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label
                          className="block text-xs font-medium mb-1"
                          style={{ color: 'var(--foreground)' }}
                        >
                          Duration
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={customUnit === 'minutes' ? 10080 : customUnit === 'hours' ? 168 : 7}
                          value={customDuration}
                          onChange={(e) => setCustomDuration(e.target.value)}
                          placeholder="Enter number"
                          className="w-full px-3 py-2 text-sm rounded-md border [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          style={{
                            backgroundColor: 'var(--background)',
                            borderColor: isValidCustomDuration()
                              ? 'var(--border)'
                              : 'var(--destructive)',
                            color: 'var(--foreground)',
                            MozAppearance: 'textfield',
                          }}
                        />
                      </div>
                      <div className="flex-1">
                        <label
                          className="block text-xs font-medium mb-1"
                          style={{ color: 'var(--foreground)' }}
                        >
                          Unit
                        </label>
                        <div className="relative" ref={unitContainerRef}>
                          <button
                            ref={unitTriggerRef}
                            type="button"
                            onClick={() => setUnitDropdownOpen(!unitDropdownOpen)}
                            className="w-full flex cursor-pointer items-center justify-between px-3 py-2 text-sm rounded-md border transition-colors"
                            style={{
                              backgroundColor: 'var(--background)',
                              borderColor: 'var(--border)',
                              color: 'var(--foreground)',
                            }}
                          >
                            <span>
                              {UNIT_OPTIONS.find((unit) => unit.value === customUnit)?.label ||
                                'Select unit'}
                            </span>
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${unitDropdownOpen ? 'rotate-180' : ''}`}
                              style={{ color: 'var(--muted-foreground)' }}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                    {useCustomDuration && customDuration && !isValidCustomDuration() && (
                      <p className="text-xs mt-1" style={{ color: 'var(--destructive)' }}>
                        Maximum:{' '}
                        {customUnit === 'minutes'
                          ? '10,080 minutes (7 days)'
                          : customUnit === 'hours'
                            ? '168 hours (7 days)'
                            : '7 days'}{' '}
                        - AWS S3 limit
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div
              className="px-6 py-4 border-t flex justify-end gap-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm cursor-pointer font-medium rounded-md transition-colors hover:bg-accent"
                style={{ color: 'var(--muted-foreground)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateLink}
                disabled={
                  isGenerating ||
                  (useCustomDuration && (!customDuration || !isValidCustomDuration()))
                }
                className="px-6 py-2 cursor-pointer text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                }}
              >
                {isGenerating ? 'Generating...' : 'Generate Link'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Share Result */}
            <div className="px-6 py-4">
              <div className="text-center mb-4">
                <div
                  className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--primary)/10' }}
                >
                  <LinkIcon className="h-6 w-6" style={{ color: 'var(--primary)' }} />
                </div>
                <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
                  Share link created!
                </h3>
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  Anyone with this link can access the file
                </p>
              </div>

              {/* Generated Link */}
              <div className="mb-4">
                <label
                  className="text-sm font-medium block mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  Share link:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={shareResult.url}
                    readOnly
                    className="flex-1 px-3 py-2 text-sm rounded border"
                    style={{
                      backgroundColor: 'var(--muted)',
                      borderColor: 'var(--border)',
                      color: 'var(--foreground)',
                    }}
                  />
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2 cursor-pointer rounded border transition-colors"
                    style={{
                      backgroundColor: copied ? 'var(--primary)' : 'var(--secondary)',
                      borderColor: 'var(--border)',
                      color: copied ? 'var(--primary-foreground)' : 'var(--foreground)',
                    }}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Expiry Info */}
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--muted)' }}>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4" style={{ color: 'var(--muted-foreground)' }} />
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    Expires on {formatExpiryDate(shareResult.expiresAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div
              className="px-6 py-4 border-t flex justify-end"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                onClick={handleClose}
                className="px-6 py-2 cursor-pointer text-sm font-medium rounded-md transition-colors"
                style={{
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>

      {/* Dropdown Portal - Renders outside modal */}
      {dropdownOpen &&
        !useCustomDuration &&
        dropdownPosition &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed py-1 rounded-lg border shadow-lg z-[70] max-h-60 overflow-y-auto"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
            }}
          >
            {DURATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setSelectedDuration(option);
                  setDropdownOpen(false);
                }}
                className="w-full px-3 py-2.5 cursor-pointer text-left hover:bg-accent transition-colors"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    {option.label}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {option.description}
                  </span>
                </div>
              </button>
            ))}
          </div>,
          document.body
        )}

      {/* Unit Dropdown Portal */}
      {unitDropdownOpen &&
        useCustomDuration &&
        unitDropdownPosition &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={unitDropdownRef}
            className="fixed py-1 rounded-lg border shadow-lg z-[70] max-h-32 overflow-y-auto"
            style={{
              top: unitDropdownPosition.top,
              left: unitDropdownPosition.left,
              width: unitDropdownPosition.width,
              backgroundColor: 'var(--card)',
              borderColor: 'var(--border)',
            }}
          >
            {UNIT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setCustomUnit(option.value as 'minutes' | 'hours' | 'days');
                  setUnitDropdownOpen(false);
                }}
                className="w-full px-3 py-2 cursor-pointer text-left text-sm hover:bg-accent transition-colors"
                style={{ color: 'var(--foreground)' }}
              >
                {option.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(dialogContent, document.body) : null;
};
