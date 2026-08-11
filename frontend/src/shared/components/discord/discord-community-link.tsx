'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { FaDiscord } from 'react-icons/fa';
import { cn } from '@/shared/utils/utils';
import { DISCORD_URL } from '@/config/links';
import { DiscordBentoCard } from './discord-bento-card';

/** Grace period so the cursor can cross the gap into the card without it closing. */
const CLOSE_DELAY_MS = 200;

/**
 * Hand-drawn squiggles tying the trigger to the card, drawn tail-first from the
 * trigger end so each sketches itself in the direction it points.
 *
 * `vertical` rises from a navbar icon into a card above it; the parent mirrors
 * it for the downward placement. `horizontal` runs sideways out of the sidebar
 * row into a card to its right.
 */
const ARROW_ART = {
  vertical: {
    viewBox: '0 0 112 64',
    curve: 'M10 58C18 54 26 56 34 50C44 43 40 34 50 30C60 26 76 32 84 26C92 18 94 10 96 4',
    head: 'M98 16L96 4L87 12',
  },
  horizontal: {
    viewBox: '0 0 64 48',
    curve: 'M4 40C12 37 14 43 22 38C30 33 26 26 34 22C42 18 52 21 58 14',
    head: 'M56 26L58 14L47 18',
  },
} as const;

/**
 * Inlined rather than kept as a file so it can stroke with `currentColor` and
 * follow the theme.
 */
function ConnectorArrow({
  orientation = 'vertical',
  className,
  style,
}: {
  orientation?: keyof typeof ARROW_ART;
  className?: string;
  style?: React.CSSProperties;
}) {
  const art = ARROW_ART[orientation];
  return (
    <motion.svg
      viewBox={art.viewBox}
      fill="none"
      aria-hidden="true"
      className={cn('pointer-events-none text-discord-brand', className)}
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
    >
      {/* the squiggle draws itself, then the head pops on at the card end */}
      <motion.path
        d={art.curve}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
      <motion.path
        d={art.head}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, delay: 0.38 }}
      />
    </motion.svg>
  );
}

/** Distance between trigger and card, and so the span the connector covers. */
const GAP_PX = 64;

interface DiscordCommunityLinkProps {
  /** Which side of the trigger the card opens on. The hero navbar sits at the
   *  bottom of the viewport, so it opens upward; the sticky navbar opens down;
   *  the dashboard sidebar opens sideways out of its own column. */
  placement?: 'top' | 'bottom' | 'right';
  /** `icon` is the navbar glyph with the hover card; `sidebar` is the labelled
   *  full-width row in the dashboard sidebar, also with the card; `row` is the
   *  entry inside the mobile hamburger menu, which always opens the bottom
   *  sheet rather than a hover card. */
  variant?: 'icon' | 'row' | 'sidebar';
  /** Classes for the trigger anchor - lets each navbar match its GitHub icon. */
  className?: string;
  /** Classes for the Discord glyph itself, again mirroring the GitHub icon. */
  iconClassName?: string;
  /** Fired when the sheet opens, so the mobile menu can collapse behind it. */
  onOpenSheet?: () => void;
}

export function DiscordCommunityLink({
  placement = 'bottom',
  variant = 'icon',
  className,
  iconClassName,
  onOpenSheet,
}: DiscordCommunityLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  // Viewport coords of the trigger's right edge, for the portalled side card.
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);

  // Resolved after mount so SSR and first client render agree.
  useEffect(() => {
    setIsTouch(window.matchMedia('(hover: none)').matches);
    setMounted(true);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // The mobile menu row is a tap target only - it never shows the hover card.
  const hoverEnabled = variant !== 'row' && !isTouch;

  /**
   * The sidebar clips its overflow on the x axis, so the side card cannot be an
   * absolutely positioned child - it is portalled out and pinned to the
   * trigger's measured position instead. Re-measured on scroll and resize so it
   * tracks the trigger while open.
   */
  useEffect(() => {
    if (!isOpen || placement !== 'right') return;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ left: rect.right, bottom: window.innerHeight - rect.bottom });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen, placement]);

  const open = useCallback(() => {
    cancelClose();
    if (hoverEnabled) setIsOpen(true);
  }, [cancelClose, hoverEnabled]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setIsOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Close on Escape while the desktop popover is up.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const handleClick = (e: React.MouseEvent) => {
    // Without a hover card available, the first tap reveals the sheet rather
    // than navigating away to Discord.
    if (!hoverEnabled) {
      e.preventDefault();
      setIsSheetOpen(true);
      onOpenSheet?.();
    }
  };

  /**
   * Page backdrop for the desktop hover card. Portalled to `body` and pinned
   * one layer below whichever chrome holds the trigger, so the page behind
   * blurs while that chrome and the card - which paint above it - stay sharp.
   * The landing navbars sit at z-50; the dashboard navbar and sidebar at z-30.
   * Pointer-events are off so it can never swallow the hover-out that closes it.
   */
  const backdrop =
    mounted &&
    createPortal(
      <AnimatePresence>
        {isOpen && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              'pointer-events-none fixed inset-0 hidden backdrop-blur-md lg:block',
              placement === 'right' ? 'z-20' : 'z-40'
            )}
          />
        )}
      </AnimatePresence>,
      document.body
    );

  /**
   * Card and connector for the sidebar placement, portalled past the sidebar's
   * overflow clip. The GAP_PX of left padding sits inside the hover region, so
   * the cursor can cross to the card without spending the close grace period.
   */
  const sidePopover =
    mounted &&
    placement === 'right' &&
    createPortal(
      <AnimatePresence>
        {isOpen && anchor && (
          <>
            <ConnectorArrow
              orientation="horizontal"
              className="fixed z-40 hidden h-12 w-16 lg:block"
              style={{ left: anchor.left, bottom: anchor.bottom + 4 }}
            />
            <motion.div
              initial={{ opacity: 0, x: -6, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -6, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="fixed z-40 hidden lg:block"
              style={{ left: anchor.left, bottom: anchor.bottom, paddingLeft: GAP_PX }}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
            >
              <DiscordBentoCard className="w-[420px] max-w-[calc(100vw-20rem)]" />
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
    );

  // Touch devices: the same Bento content, presented as a bottom sheet.
  const sheet = (
    <Dialog.Root open={isSheetOpen} onOpenChange={setIsSheetOpen}>
      <AnimatePresence>
        {isSheetOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-100 bg-black/50 backdrop-blur-md"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 320 }}
                className="fixed inset-x-0 bottom-0 z-110 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
              >
                <VisuallyHidden>
                  <Dialog.Title>Opndrive Discord community</Dialog.Title>
                </VisuallyHidden>
                <div className="mx-auto w-full max-w-md">
                  <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/40" />
                  <DiscordBentoCard className="w-full" />
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );

  if (variant === 'sidebar') {
    return (
      <>
        <div
          ref={triggerRef}
          className={cn('relative flex min-w-0 flex-1', className)}
          onMouseEnter={open}
          onMouseLeave={scheduleClose}
          onFocus={open}
          onBlur={scheduleClose}
        >
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join our discord channel"
            aria-expanded={isOpen}
            onClick={handleClick}
            className="flex min-w-0 flex-1 items-center py-2 pl-3"
          >
            <FaDiscord
              className={cn('mr-3 h-5 w-5 flex-shrink-0 text-discord-brand', iconClassName)}
            />
            <span className="truncate">Join our Discord</span>
          </a>
        </div>
        {sidePopover}
        {backdrop}
        {sheet}
      </>
    );
  }

  if (variant === 'row') {
    return (
      <>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Join our discord channel"
          onClick={handleClick}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            className
          )}
        >
          <FaDiscord className={cn('w-4 h-4', iconClassName)} />
          <span>Join our discord channel</span>
        </a>
        {sheet}
      </>
    );
  }

  return (
    <>
      <div
        className="relative inline-flex"
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={open}
        onBlur={scheduleClose}
      >
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Join our discord channel"
          aria-expanded={isOpen}
          onClick={handleClick}
          className={cn('group transition-colors duration-200', className)}
          style={{ color: 'var(--muted-foreground)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--foreground)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--muted-foreground)';
          }}
        >
          <FaDiscord
            className={cn('transition-transform duration-200 group-hover:scale-110', iconClassName)}
          />
        </a>

        {/* Desktop hover card. The padding lives on the wrapper, not as a margin,
            so the gap between icon and card is still inside the hover region. */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: placement === 'bottom' ? -6 : 6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: placement === 'bottom' ? -6 : 6, scale: 0.97 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className={cn(
                // Offset up and to the right of the icon: the 64px of padding
                // is the gap the connector arrow spans, and stays inside the
                // hover region so the cursor can cross it without closing.
                'absolute left-[calc(50%+64px)] z-60 hidden -translate-x-1/2 lg:block',
                placement === 'bottom' ? 'top-full pt-16' : 'bottom-full pb-16'
              )}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
            >
              <DiscordBentoCard className="w-[420px] max-w-[calc(100vw-2rem)]" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Connector, drawn in the gap the offset above opens up. Its tail
            starts by the icon and its tip points into the card's near edge. */}
        <AnimatePresence>
          {isOpen && (
            <ConnectorArrow
              className={cn(
                // -translate-x-2 starts the tail over the icon rather than beside it.
                'absolute left-1/2 z-60 hidden h-16 w-28 -translate-x-2 lg:block',
                // Drawn icon-at-bottom for a card above; only the downward
                // placement needs the vertical mirror.
                placement === 'bottom' ? 'top-full -scale-y-100' : 'bottom-full'
              )}
            />
          )}
        </AnimatePresence>
      </div>

      {backdrop}
      {sheet}
    </>
  );
}
