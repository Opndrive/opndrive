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
  // Spans the gap and the rise together, so its top-right corner lands exactly
  // on the card's bottom-left corner.
  horizontal: {
    viewBox: '0 0 64 72',
    curve: 'M4 62C12 57 14 64 22 57C30 50 24 42 32 36C40 30 46 34 50 26C53 20 55 14 58 10',
    head: 'M57 22L58 10L47 15',
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

/** How far the side card is lifted above its trigger, for the same reason. */
const SIDE_RISE_PX = 72;

/**
 * How far the vertical connector reaches sideways out of its trigger - the
 * `w-28` it is drawn in, less the `-translate-x-2` that starts its tail over
 * the icon rather than beside it.
 */
const ARROW_REACH_PX = { left: -8, right: 104 };

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
  /** Measure this element instead of the trigger when placing the side card.
   *  The sidebar passes its whole row so the connector starts clear of the
   *  dismiss button rather than drawing straight across it. */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function DiscordCommunityLink({
  placement = 'bottom',
  variant = 'icon',
  className,
  iconClassName,
  onOpenSheet,
  anchorRef,
}: DiscordCommunityLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  /**
   * Where the trigger is on screen, in viewport coordinates, which is all a
   * fixed-position card needs to be pinned to any side of it. `viewportHeight`
   * rides along so the render can pin by `bottom` without reading `window`.
   */
  const [anchor, setAnchor] = useState<{
    centerX: number;
    rightEdge: number;
    top: number;
    bottom: number;
    viewportHeight: number;
  } | null>(null);
  // Whether the card had to open on the side opposite the one asked for.
  const [flipped, setFlipped] = useState(false);
  // Whether the connector has room to be drawn without landing on something.
  const [arrowFits, setArrowFits] = useState(false);

  /**
   * Which side the card actually opens on.
   *
   * `placement` is a preference, not an outcome. The hero navbar asks for
   * `top` because it sits near the bottom of the viewport - but it scrolls
   * with the page, and once the reader has pushed it near the top there is no
   * longer room above it, so the card opened off the top of the screen. It now
   * flips to whichever side can hold it.
   */
  const resolvedPlacement =
    placement !== 'right' && flipped ? (placement === 'top' ? 'bottom' : 'top') : placement;

  /** True once the trigger has been measured, which is when the card mounts. */
  const isPositioned = anchor !== null;

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
   * Track the trigger while the card is open.
   *
   * The card cannot be an absolutely positioned child of the trigger, because
   * an ancestor that clips its overflow would cut it off - and two of them do.
   * The dashboard sidebar clips its x axis; the hero section clips both, which
   * is why a card opening downward out of the hero navbar was invisible while
   * its connector, drawn nearer the icon, was only half cut off. So the card is
   * portalled to `body` and pinned to the measured position instead, which
   * means re-measuring as the trigger scrolls.
   */
  useEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const rect = (anchorRef?.current ?? triggerRef.current)?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        centerX: rect.left + rect.width / 2,
        rightEdge: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
      });
    };
    measure();
    // Passive: this only ever reads the trigger's position, and a listener the
    // browser has to wait on before scrolling is what makes scrolling stutter.
    const scrollOpts = { capture: true, passive: true } as const;
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, scrollOpts);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, scrollOpts);
    };
  }, [isOpen, anchorRef]);

  /**
   * Measure the card against the room on each side of the trigger, and flip if
   * the requested side cannot hold it. The wrapper is what gets measured, so
   * its height already includes the GAP_PX of padding the connector is drawn
   * in - the card needs the gap as much as it needs its own body.
   *
   * `offsetHeight` and not `getBoundingClientRect()`, because the card enters
   * at `scale: 0.97` and only the former ignores the transform and reports the
   * height the card is settling into.
   *
   * Gated on `isPositioned` rather than on `anchor` itself. The card only
   * enters the DOM once the trigger has been measured, so on the render that
   * opens it there is nothing yet to measure - and depending on the anchor
   * value instead would re-run this on every scroll event, flipping the card
   * back and forth underneath a reader. A boolean settles once and stays put.
   */
  useEffect(() => {
    if (!isOpen || !isPositioned || placement === 'right') return;

    const fit = () => {
      const trigger = triggerRef.current;
      const card = cardRef.current;
      if (!trigger || !card) return;

      const rect = trigger.getBoundingClientRect();
      const needed = card.offsetHeight;
      const above = rect.top;
      const below = window.innerHeight - rect.bottom;
      const [preferred, other] = placement === 'top' ? [above, below] : [below, above];

      // Only when the other side is genuinely roomier: if neither fits there is
      // nothing to gain by moving, and flipping anyway just looks like a glitch.
      setFlipped(preferred < needed && other > preferred);

      /**
       * And whether to draw the connector at all.
       *
       * The squiggle reaches a long way sideways out of its trigger, and it is
       * drawn above the chrome it comes out of, so it wins every overlap. Out
       * of a full-width sidebar row that costs nothing - it leaves into open
       * page. Out of a navbar the trigger is a 20px icon in a packed row, and
       * the squiggle lands across whichever control sits next to it. So look
       * for anything within its reach, and where there is something, let the
       * card stand on its own.
       */
      const centerX = rect.left + rect.width / 2;
      const reachLeft = centerX + ARROW_REACH_PX.left;
      const reachRight = centerX + ARROW_REACH_PX.right;
      const neighbours = Array.from(trigger.parentElement?.children ?? []);

      setArrowFits(
        neighbours.every((el) => {
          if (el === trigger) return true;
          const r = el.getBoundingClientRect();
          return r.right <= reachLeft || r.left >= reachRight;
        })
      );
    };

    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [isOpen, isPositioned, placement]);

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
   * Card and connector, portalled to `body` past whatever clips the trigger.
   *
   * Both arrangements keep the run between trigger and card inside the hover
   * region - as padding on the card wrapper rather than a margin - so the
   * cursor can cross the gap without spending the close grace period. The
   * vertical one is pinned by `top` when it hangs below the trigger and by
   * `bottom` when it rises above, which is what `top-full` and `bottom-full`
   * did while it was still an absolutely positioned child.
   */
  const popover =
    mounted &&
    createPortal(
      <AnimatePresence>
        {isOpen && anchor ? (
          placement === 'right' ? (
            <>
              <ConnectorArrow
                orientation="horizontal"
                className="fixed z-40 hidden h-18 w-16 lg:block"
                style={{
                  left: anchor.rightEdge,
                  bottom: anchor.viewportHeight - anchor.bottom,
                }}
              />
              <motion.div
                initial={{ opacity: 0, x: -6, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -6, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className="fixed z-40 hidden lg:block"
                // The padding lifts and offsets the card while keeping the whole
                // L-shaped run between row and card inside the hover region.
                style={{
                  left: anchor.rightEdge,
                  bottom: anchor.viewportHeight - anchor.bottom,
                  paddingLeft: GAP_PX,
                  paddingBottom: SIDE_RISE_PX,
                }}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                <DiscordBentoCard className="w-[420px] max-w-[calc(100vw-20rem)]" />
              </motion.div>
            </>
          ) : (
            <>
              {/* Drawn icon-at-bottom for a card above; only the downward
                placement needs the vertical mirror. Left out entirely when
                there is something within its reach to land on. */}
              {arrowFits && (
                <ConnectorArrow
                  className={cn(
                    'fixed z-60 hidden h-16 w-28 -translate-x-2 lg:block',
                    resolvedPlacement === 'bottom' && '-scale-y-100'
                  )}
                  style={
                    resolvedPlacement === 'bottom'
                      ? { left: anchor.centerX, top: anchor.bottom }
                      : { left: anchor.centerX, bottom: anchor.viewportHeight - anchor.top }
                  }
                />
              )}
              <motion.div
                ref={cardRef}
                initial={{ opacity: 0, y: resolvedPlacement === 'bottom' ? -6 : 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: resolvedPlacement === 'bottom' ? -6 : 6, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                className={cn(
                  // Offset to the right of the icon by the same GAP_PX the
                  // connector spans, and padded by it on the side facing the
                  // trigger so the gap stays inside the hover region.
                  'fixed z-60 hidden -translate-x-1/2 lg:block',
                  resolvedPlacement === 'bottom' ? 'pt-16' : 'pb-16'
                )}
                style={
                  resolvedPlacement === 'bottom'
                    ? { left: anchor.centerX + GAP_PX, top: anchor.bottom }
                    : {
                        left: anchor.centerX + GAP_PX,
                        bottom: anchor.viewportHeight - anchor.top,
                      }
                }
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                <DiscordBentoCard className="w-[420px] max-w-[calc(100vw-2rem)]" />
              </motion.div>
            </>
          )
        ) : null}
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
        {popover}
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
        ref={triggerRef}
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
      </div>

      {popover}
      {backdrop}
      {sheet}
    </>
  );
}
