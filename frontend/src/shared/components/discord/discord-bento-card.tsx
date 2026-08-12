'use client';

import { Calendar, GitPullRequest, MessageSquare, ArrowRight } from 'lucide-react';
import { FaDiscord } from 'react-icons/fa';
import { cn } from '@/shared/utils/utils';
import { DISCORD_URL } from '@/config/links';

import {
  BENTO_EMOJI,
  BuilderAvatars,
  CornerEmoji,
  LiveBadge,
  Noise,
  TILE_BASE,
} from './bento-primitives';

export function DiscordBentoCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-3 gap-2.5 rounded-3xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-xl',
        className
      )}
    >
      {/* ---------- Header ---------- */}
      <div className="col-span-3 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Opndrive Community
        </span>
        <FaDiscord className="h-3.5 w-3.5 text-discord-brand" />
      </div>

      {/* ---------- Card A - wide hero tile ---------- */}
      <div className={cn(TILE_BASE, 'col-span-2 p-3.5')}>
        {/* ambient glow, tinted with the theme's primary */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-8 -top-10 h-32 w-32 rounded-full bg-primary/30 blur-2xl"
        />
        <Noise />
        <CornerEmoji src={BENTO_EMOJI.hangouts} className="-right-5 -top-5 h-24 w-24 rotate-12" />

        <div className="relative">
          <LiveBadge className="mb-2.5" />

          <h3 className="text-sm font-semibold leading-snug text-foreground">
            Community Meetups
            <br />
            &amp; Live Demos
          </h3>

          {/* calendar visualizer - alternating days lit, matching the cadence */}
          <div className="mt-3 flex items-center gap-1">
            <Calendar className="mr-1 h-3 w-3 text-muted-foreground" />
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
              <span
                key={i}
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded text-[9px] font-medium',
                  i % 2 === 0
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/40'
                    : 'bg-foreground/10 text-muted-foreground'
                )}
              >
                {day}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- Card B - tall accent tile ---------- */}
      <div className={cn(TILE_BASE, 'col-span-1 row-span-2 flex flex-col bg-accent/50 p-3.5')}>
        <Noise opacity={0.25} />
        {/* top-right: this tile's bottom half is taken by the diff preview */}
        <CornerEmoji src={BENTO_EMOJI.reviews} className="-right-5 -top-5 h-20 w-20 -rotate-12" />

        <div className="relative">
          <GitPullRequest className="h-4 w-4 text-primary" />
          <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">
            PR &amp; Code
            <br />
            Reviews
          </h3>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Ship with the maintainers.
          </p>
        </div>

        {/* mini terminal / diff preview */}
        <div className="relative mt-auto overflow-hidden rounded-lg border border-border bg-background/80">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-community-diff-remove/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-community-live/60" />
          </div>
          <div className="space-y-0.5 p-2 font-mono text-[9px] leading-tight">
            <div className="text-community-diff-add">+ 128 lines added</div>
            <div className="text-community-diff-remove">- 42 removed</div>
            <div className="truncate text-muted-foreground/70">~ s3-api/upload.ts</div>
          </div>
        </div>
      </div>

      {/* ---------- Card C - compact glass tile ---------- */}
      <div
        className={cn(
          TILE_BASE,
          'col-span-1 border-foreground/10 bg-foreground/[0.04] p-3 backdrop-blur-md'
        )}
      >
        <Noise opacity={0.25} />
        {/* bottom-right: clear of the icons above and the tag at bottom-left */}
        <CornerEmoji
          src={BENTO_EMOJI.debugging}
          className="-bottom-4 -right-4 h-16 w-16 -rotate-12"
        />

        <div className="relative">
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="mt-2 text-[11px] font-semibold leading-tight text-foreground">
            24/7 Issue
            <br />
            Debugging
          </h3>
        </div>
      </div>

      {/* ---------- Card D - compact status tile ---------- */}
      <div className={cn(TILE_BASE, 'col-span-1 p-3')}>
        <Noise opacity={0.25} />
        {/* the rocket art already carries a -15deg tilt, so this only nudges it */}
        <CornerEmoji src={BENTO_EMOJI.builders} className="-right-4 -top-4 h-16 w-16 -rotate-6" />

        <div className="relative">
          {/* stacked member avatars - illustrations, not real members */}
          <BuilderAvatars />
          <h3 className="mt-2 text-[11px] font-semibold leading-tight text-foreground">
            Active Builders
          </h3>
          <p className="mt-1 text-[9px] leading-tight text-muted-foreground">Be an early member</p>
        </div>
      </div>

      {/* ---------- Card E - full-width CTA ---------- */}
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group/cta col-span-3 flex items-center justify-center gap-2 rounded-2xl bg-discord-brand px-4 py-2.5 text-xs font-semibold text-discord-brand-foreground shadow-lg shadow-discord-brand/20 transition-all duration-200 hover:bg-discord-brand-hover hover:shadow-discord-brand/35"
      >
        <FaDiscord className="h-4 w-4" />
        Join Opndrive Discord
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
      </a>
    </div>
  );
}
