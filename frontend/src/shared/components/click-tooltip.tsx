'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ClickTooltipProps {
  label: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  displayDuration?: number; // How long to show tooltip in ms (0 = until clicked again)
  className?: string;
}

export function ClickTooltip({
  label,
  children,
  position = 'top',
  displayDuration = 2000,
  className = '',
}: ClickTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const clearTimeoutRef = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const calculateOptimalPosition = (
    triggerRect: DOMRect,
    tooltipRect: DOMRect,
    viewport: { width: number; height: number }
  ) => {
    const spacing = 8;
    const positions = [
      {
        name: 'top' as const,
        x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        y: triggerRect.top - tooltipRect.height - spacing,
        fits: triggerRect.top - tooltipRect.height - spacing >= spacing,
      },
      {
        name: 'bottom' as const,
        x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        y: triggerRect.bottom + spacing,
        fits: triggerRect.bottom + tooltipRect.height + spacing <= viewport.height - spacing,
      },
      {
        name: 'left' as const,
        x: triggerRect.left - tooltipRect.width - spacing,
        y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
        fits: triggerRect.left - tooltipRect.width - spacing >= spacing,
      },
      {
        name: 'right' as const,
        x: triggerRect.right + spacing,
        y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
        fits: triggerRect.right + tooltipRect.width + spacing <= viewport.width - spacing,
      },
    ];

    const requested = positions.find((p) => p.name === position && p.fits);
    if (requested) return requested;

    const fallback = positions.find((p) => p.fits) ?? positions[0];
    return {
      ...fallback,
      x: Math.max(spacing, Math.min(fallback.x, viewport.width - tooltipRect.width - spacing)),
      y: Math.max(spacing, Math.min(fallback.y, viewport.height - tooltipRect.height - spacing)),
    };
  };

  const showTooltip = () => {
    if (!label.trim()) return;

    clearTimeoutRef();

    // Pre-calculate position using temporary hidden element (like AriaLabel does)
    if (triggerRef.current) {
      const temp = document.createElement('div');
      temp.className = `custom-aria-label ${position}`;
      Object.assign(temp.style, {
        visibility: 'hidden',
        position: 'fixed',
        top: '-9999px',
      } as CSSStyleDeclaration);
      temp.textContent = label;
      document.body.appendChild(temp);

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = temp.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const { x, y } = calculateOptimalPosition(triggerRect, tooltipRect, viewport);
      document.body.removeChild(temp);
      setTooltipPosition({ x, y });
    }

    setIsVisible(true);

    // Auto-hide after duration (if set)
    if (displayDuration > 0) {
      timeoutRef.current = window.setTimeout(() => {
        setIsVisible(false);
      }, displayDuration);
    }
  };

  const hideTooltip = () => {
    clearTimeoutRef();
    setIsVisible(false);
  };

  const toggleTooltip = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isVisible) {
      hideTooltip();
    } else {
      showTooltip();
    }
  };

  // Mount effect
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!isVisible) return;

    const update = () => {
      if (!triggerRef.current || !tooltipRef.current) return;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const { x, y } = calculateOptimalPosition(triggerRect, tooltipRect, viewport);
      setTooltipPosition({ x, y });
    };

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isVisible, position]);

  // Cleanup timeout
  useEffect(() => {
    return () => clearTimeoutRef();
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(target)
      ) {
        hideTooltip();
      }
    };

    // Small delay to prevent immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible]);

  // ESC key to close
  useEffect(() => {
    if (!isVisible) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideTooltip();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isVisible]);

  const tooltip =
    mounted && isVisible ? (
      <div
        ref={tooltipRef}
        role="tooltip"
        className={`custom-aria-label show ${position} ${className}`}
        style={{
          position: 'fixed',
          left: `${tooltipPosition.x}px`,
          top: `${tooltipPosition.y}px`,
          zIndex: 9999,
          pointerEvents: 'auto',
        }}
      >
        {label}
      </div>
    ) : null;

  return (
    <>
      <div
        ref={triggerRef}
        onClick={toggleTooltip}
        onTouchEnd={toggleTooltip}
        className="inline-block cursor-pointer"
      >
        {children}
      </div>
      {mounted && createPortal(tooltip, document.body)}
    </>
  );
}
