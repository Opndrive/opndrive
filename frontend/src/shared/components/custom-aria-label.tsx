'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface CustomAriaLabelProps {
  label: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  multiline?: boolean;
  disabled?: boolean;
  className?: string;
}

export function CustomAriaLabel({
  label,
  children,
  position = 'top',
  delay = 500,
  multiline = false,
  disabled = false,
  className = '',
}: CustomAriaLabelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const calculateOptimalPosition = (
    triggerRect: DOMRect,
    tooltipRect: DOMRect,
    viewport: { width: number; height: number }
  ) => {
    const spacing = 8;
    const positions = [
      // Prefer top and bottom first
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
      // Then left and right as fallbacks
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

    // Find the best position that fits, prioritizing the requested position if it fits
    const requestedPosition = positions.find((p) => p.name === position && p.fits);
    if (requestedPosition) {
      return requestedPosition;
    }

    // Otherwise, find the first position that fits
    const fittingPosition = positions.find((p) => p.fits);
    if (fittingPosition) {
      return fittingPosition;
    }

    // If nothing fits perfectly, use the requested position and clamp to viewport
    const fallbackPosition = positions.find((p) => p.name === position) || positions[0];
    return {
      ...fallbackPosition,
      x: Math.max(
        spacing,
        Math.min(fallbackPosition.x, viewport.width - tooltipRect.width - spacing)
      ),
      y: Math.max(
        spacing,
        Math.min(fallbackPosition.y, viewport.height - tooltipRect.height - spacing)
      ),
    };
  };

  const calculatePosition = () => {
    // This function is now mainly for window resize adjustments
    if (!triggerRef.current || !tooltipRef.current || !isVisible) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const optimalPosition = calculateOptimalPosition(triggerRect, tooltipRect, viewport);
    setTooltipPosition({ x: optimalPosition.x, y: optimalPosition.y });
  };

  const showTooltip = () => {
    if (disabled || !label.trim()) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      // Pre-calculate position before showing tooltip
      if (triggerRef.current) {
        // Create a temporary invisible tooltip to measure dimensions
        const tempTooltip = document.createElement('div');
        tempTooltip.className = `custom-aria-label ${position} ${multiline ? 'multiline' : ''}`;
        tempTooltip.style.visibility = 'hidden';
        tempTooltip.style.position = 'fixed';
        tempTooltip.style.top = '-9999px';
        tempTooltip.textContent = label;
        document.body.appendChild(tempTooltip);

        const triggerRect = triggerRef.current.getBoundingClientRect();
        const tooltipRect = tempTooltip.getBoundingClientRect();
        const viewport = {
          width: window.innerWidth,
          height: window.innerHeight,
        };

        // Use optimal positioning logic
        const optimalPosition = calculateOptimalPosition(triggerRect, tooltipRect, viewport);

        // Clean up temp element
        document.body.removeChild(tempTooltip);

        // Set position before showing
        setTooltipPosition({ x: optimalPosition.x, y: optimalPosition.y });
      }

      // Show tooltip with correct position
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const handleMouseEnter = () => {
    showTooltip();
  };

  const handleMouseLeave = () => {
    hideTooltip();
  };

  const handleFocus = () => {
    showTooltip();
  };

  const handleBlur = () => {
    hideTooltip();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Show tooltip on Tab focus or Arrow navigation
    if (e.key === 'Tab' || e.key.startsWith('Arrow')) {
      showTooltip();
    }
    // Hide on Escape
    if (e.key === 'Escape') {
      hideTooltip();
    }
  };

  // Update position on scroll/resize
  useEffect(() => {
    if (!isVisible) return;

    const updatePosition = () => calculatePosition();

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, position]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const tooltip =
    mounted && isVisible ? (
      <div
        ref={tooltipRef}
        className={`custom-aria-label ${isVisible ? 'show' : ''} ${position} ${
          multiline ? 'multiline' : ''
        } ${className}`}
        style={{
          left: tooltipPosition.x,
          top: tooltipPosition.y,
        }}
        role="tooltip"
        aria-hidden={!isVisible}
      >
        {label}
      </div>
    ) : null;

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        aria-label={label}
        className="inline-block"
      >
        {children}
      </div>
      {mounted && createPortal(tooltip, document.body)}
    </>
  );
}

// Convenience wrapper for common use cases
export function AriaLabel(props: CustomAriaLabelProps) {
  return <CustomAriaLabel {...props} />;
}

// Hook for programmatic tooltip control
export function useCustomAriaLabel() {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [content, setContent] = useState('');

  const show = (text: string, x: number, y: number) => {
    setContent(text);
    setPosition({ x, y });
    setIsVisible(true);
  };

  const hide = () => {
    setIsVisible(false);
  };

  return {
    isVisible,
    position,
    content,
    show,
    hide,
  };
}
