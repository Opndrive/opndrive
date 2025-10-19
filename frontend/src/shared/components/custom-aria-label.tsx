'use client';

import { useEffect, useRef, useState, ReactNode, useId } from 'react';
import { createPortal } from 'react-dom';

export interface CustomAriaLabelProps {
  label: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  multiline?: boolean;
  disabled?: boolean;
  className?: string;
  /** Make the wrapper focusable if child isn’t naturally focusable */
  focusableWrapper?: boolean;
}

export function CustomAriaLabel({
  label,
  children,
  position = 'top',
  delay = 500,
  multiline = false,
  disabled = false,
  className = '',
  focusableWrapper = false,
}: CustomAriaLabelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const isMouseOverRef = useRef(false);
  const tooltipId = useId();

  const isSmallDevice = typeof window !== 'undefined' && window.innerWidth < 768;

  const clearTimeoutRef = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const showTooltip = () => {
    if (disabled || !label.trim()) return;

    clearTimeoutRef(timeoutRef);

    if (triggerRef.current) {
      const temp = document.createElement('div');
      temp.className = `custom-aria-label ${position} ${multiline ? 'multiline' : ''}`;
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
  };

  const hideTooltip = () => {
    clearTimeoutRef(timeoutRef);
    clearTimeoutRef(longPressTimeoutRef);
    setIsVisible(false);
  };

  // Touch/long-press
  const handleTouchStart = () => {
    if (!isSmallDevice || disabled || !label.trim()) return;
    clearTimeoutRef(longPressTimeoutRef);
    longPressTimeoutRef.current = window.setTimeout(showTooltip, 800);
  };
  const handleTouchEndOrMove = () => hideTooltip();

  const handleMouseEnter = () => {
    if (isSmallDevice || disabled || !label.trim()) return;
    isMouseOverRef.current = true;
    clearTimeoutRef(timeoutRef);
    timeoutRef.current = window.setTimeout(() => {
      if (isMouseOverRef.current) showTooltip();
    }, delay);
  };
  const handleMouseLeave = () => {
    isMouseOverRef.current = false;
    hideTooltip();
  };

  // Keyboard focus support
  const handleFocus = () => {
    if (disabled || !label.trim()) return;
    showTooltip();
  };
  const handleBlur = () => hideTooltip();

  // Click should not keep it around
  const handleMouseDown = () => hideTooltip();

  // Position updates
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
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

  useEffect(
    () => () => {
      clearTimeoutRef(timeoutRef);
      clearTimeoutRef(longPressTimeoutRef);
    },
    []
  );

  const tooltip =
    mounted && isVisible ? (
      <div
        ref={tooltipRef}
        id={tooltipId}
        role="tooltip"
        aria-hidden={false}
        className={`custom-aria-label show ${position} ${multiline ? 'multiline' : ''} ${className}`}
        style={{
          position: 'fixed',
          left: `${tooltipPosition.x}px`,
          top: `${tooltipPosition.y}px`,
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        {label}
      </div>
    ) : null;

  const triggerProps = {
    ref: triggerRef,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onMouseDown: handleMouseDown,
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEndOrMove,
    onTouchCancel: handleTouchEndOrMove,
    onTouchMove: handleTouchEndOrMove,
    onFocus: handleFocus,
    onBlur: handleBlur,
    // Link to the tooltip only when it's actually shown
    ...(isVisible && !disabled && label.trim() ? { 'aria-describedby': tooltipId } : {}),
    className: 'inline-block',
    ...(focusableWrapper ? { tabIndex: 0 } : {}),
  } as const;

  return (
    <>
      <div {...triggerProps}>{children}</div>
      {mounted && createPortal(tooltip, document.body)}
    </>
  );

  // ---- positioning helper (unchanged from your approach) ----
  function calculateOptimalPosition(
    triggerRect: DOMRect,
    tooltipRect: DOMRect,
    viewport: { width: number; height: number }
  ) {
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
  }
}

// Convenience wrapper
export function AriaLabel(props: CustomAriaLabelProps) {
  return <CustomAriaLabel {...props} />;
}
