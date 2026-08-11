'use client';

import { ArrowRight } from 'lucide-react';
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

/**
 * Wide community tile for the landing page's closing CTA. Built from the same
 * primitives as the navbar hover card so the two read as one system, laid out
 * as a single row rather than a grid to suit the full-width slot.
 */
export function DiscordCtaBanner({ className }: { className?: string }) {
  return (
    <div className={cn(TILE_BASE, 'p-5 text-left sm:p-6', className)}>
      {/* two ambient glows, primary at one corner and brand at the other */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-12 -top-16 h-48 w-48 rounded-full bg-primary/25 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 right-1/4 h-40 w-40 rounded-full bg-discord-brand/20 blur-3xl"
      />
      <Noise opacity={0.25} />
      <CornerEmoji
        src={BENTO_EMOJI.builders}
        className="-right-6 -top-6 h-28 w-28 -rotate-6 sm:h-32 sm:w-32"
      />
      <CornerEmoji
        src={BENTO_EMOJI.hangouts}
        className="-bottom-8 left-1/2 hidden h-24 w-24 rotate-12 opacity-30 lg:block"
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <LiveBadge className="mb-3" />

          <h3 className="text-lg font-bold leading-snug text-foreground sm:text-xl">
            Build Opndrive with us
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Live demos, reviews on your PRs, and a hand when you get stuck.
          </p>

          <div className="mt-4 flex items-center gap-2.5">
            <BuilderAvatars />
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              Be an early member
            </span>
          </div>
        </div>

        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group/cta inline-flex flex-shrink-0 items-center justify-center gap-2 self-start whitespace-nowrap rounded-xl bg-discord-brand px-5 py-3 text-sm font-semibold text-discord-brand-foreground shadow-lg shadow-discord-brand/20 transition-all duration-200 hover:bg-discord-brand-hover hover:shadow-discord-brand/35 sm:self-auto sm:px-6 sm:text-base"
        >
          <FaDiscord className="h-5 w-5" />
          Join our Discord
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
        </a>
      </div>
    </div>
  );
}
