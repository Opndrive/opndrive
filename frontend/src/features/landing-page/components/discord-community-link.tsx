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
 * Hand-drawn squiggle tying the navbar icon to the card. Inlined rather than
 * kept as a file so it can stroke with `currentColor` and follow the theme.
 * Drawn tail-first (icon end) to tip (card end), so it sketches itself in the
 * direction it points; the parent flips it vertically for the downward
 * placement.
 */
function ConnectorArrow({ className }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 112 64"
      fill="none"
      aria-hidden="true"
      className={cn('pointer-events-none absolute text-discord-brand', className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
    >
      {/* the squiggle draws itself from the icon, then the head pops on at the card */}
      <motion.path
        d="M10 58C18 54 26 56 34 50C44 43 40 34 50 30C60 26 76 32 84 26C92 18 94 10 96 4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      />
      <motion.path
        d="M98 16L96 4L87 12"
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

interface DiscordCommunityLinkProps {
  /** Which side of the trigger the card opens on. The hero navbar sits at the
   *  bottom of the viewport, so it opens upward; the sticky navbar opens down. */
  placement?: 'top' | 'bottom';
  /** `icon` is the navbar glyph with the hover card; `row` is the labelled
   *  full-width entry used inside the mobile hamburger menu, which always
   *  opens the bottom sheet rather than a hover card. */
  variant?: 'icon' | 'row';
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

  // The menu row is a tap target only - it never shows the hover card.
  const hoverEnabled = variant === 'icon' && !isTouch;

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
   * Page backdrop for the desktop hover card. Portalled to `body` and pinned at
   * z-40, one layer below the navbars' z-50, so the page behind blurs while the
   * navbar and the card itself - which paint above it - stay perfectly sharp.
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
            className="pointer-events-none fixed inset-0 z-40 hidden backdrop-blur-md lg:block"
          />
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
                'left-1/2 z-60 hidden h-16 w-28 -translate-x-2 lg:block',
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
